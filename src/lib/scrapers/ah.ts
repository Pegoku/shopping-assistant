import { Supermarket } from "@prisma/client";
import type { ScrapeProgressReporter, ScrapeResult, ScrapedProduct } from "@/lib/scrapers/types";
import {
  absoluteUrl,
  fetchHtml,
  getOptionalPageLimit,
  type CategoryLink,
  parseCategoryLinksFromHtml,
  parseQuantity,
  textContent,
} from "@/lib/scrapers/utils";

type AhApolloState = Record<string, unknown> & {
  ROOT_QUERY?: Record<string, unknown>;
};

type AhProductRecord = {
  id: number;
  title: string;
  category?: string;
  webPath?: string;
  salesUnitSize?: string;
  imagePack?: Array<{ small?: { url?: string } }>;
  [key: `priceV2(${string})`]:
    | {
        now?: { amount?: number };
        was?: { amount?: number };
        unitInfo?: { price?: { amount?: number }; description?: string };
        discount?: { description?: string } | null;
        promotionLabels?: Array<{ text?: string } | string>;
      }
    | undefined;
};

const baseUrl = "https://www.ah.nl";

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

export async function discoverAlbertHeijnCategories(): Promise<CategoryLink[]> {
  const html = await fetchHtml(`${baseUrl}/producten`);
  return parseCategoryLinksFromHtml(
    html,
    (path) => /^\/producten\/\d+\//.test(path) && !path.includes("/producten/product/"),
  );
}

function parseApolloState(html: string) {
  const match = html.match(/window\.__APOLLO_STATE__=\s*(\{[\s\S]*?\})\s*window\.__MEMBER_DATA__=/);

  if (!match) {
    throw new Error("AH Apollo state not found");
  }

  return JSON.parse(match[1].replace(/:undefined/g, ":null")) as AhApolloState;
}

function getSearchCategoryPayload(state: AhApolloState) {
  const root = state.ROOT_QUERY ?? {};
  const searchCategoryKey = Object.keys(root).find((key) => key.startsWith("searchCategory:"));

  if (!searchCategoryKey) {
    throw new Error("AH category search payload not found");
  }

  return root[searchCategoryKey] as {
    products?: Array<{ __ref: string }>;
  };
}

function getProductTaxonomyCount(state: AhApolloState, taxonomyId: string) {
  const taxonomy = state[`ProductTaxonomy:${taxonomyId}`] as { totalProductCount?: number } | undefined;
  return taxonomy?.totalProductCount ?? 0;
}

function extractPriceData(product: AhProductRecord) {
  const priceKey = Object.keys(product).find((key) => key.startsWith("priceV2("));
  const priceData = (priceKey ? product[priceKey as keyof AhProductRecord] : undefined) as
    | {
        now?: { amount?: number };
        was?: { amount?: number };
        unitInfo?: { price?: { amount?: number }; description?: string };
        discount?: { description?: string } | null;
        promotionLabels?: Array<{ text?: string } | string>;
      }
    | undefined;

  const promotionLabels =
    priceData?.promotionLabels
      ?.map((label) => (typeof label === "string" ? label : textContent(label.text)))
      .filter(Boolean) ?? [];

  const dealText = textContent([priceData?.discount?.description, ...promotionLabels].filter(Boolean).join(" • ")) || undefined;

  return {
    currentPrice: priceData?.now?.amount,
    currentUnitPrice: priceData?.unitInfo?.price?.amount,
    normalizedUnit: priceData?.unitInfo?.description?.toLowerCase(),
    dealText,
    isDealActive: Boolean(dealText) || Boolean(priceData?.was?.amount && priceData.was.amount > (priceData.now?.amount ?? 0)),
  };
}

function getProductKey(product: ScrapedProduct) {
  return product.sourceUrl ?? product.sourceId ?? `${product.originalName}::${product.quantityText}`;
}

function parseProductsFromState(state: AhApolloState) {
  const payload = getSearchCategoryPayload(state);
  const refs = payload.products ?? [];
  const products: ScrapedProduct[] = [];

  for (const ref of refs) {
    const product = state[ref.__ref] as AhProductRecord | undefined;

    if (!product?.title) {
      continue;
    }

    const quantityText = textContent(product.salesUnitSize) || "per item";
    const quantity = parseQuantity(quantityText);
    const price = extractPriceData(product);

    if (!price.currentPrice) {
      continue;
    }

    const categories = product.category
      ?.split("/")
      .map((category) => textContent(category))
      .filter(Boolean);

    products.push({
      supermarket: Supermarket.AH,
      sourceId: String(product.id),
      originalName: textContent(product.title),
      quantityText,
      unitAmount: quantity.unitAmount,
      normalizedUnit: quantity.normalizedUnit ?? price.normalizedUnit,
      currentPrice: price.currentPrice,
      currentUnitPrice: price.currentUnitPrice,
      imageUrl: product.imagePack?.[0]?.small?.url,
      sourceUrl: absoluteUrl(baseUrl, product.webPath),
      dealText: price.dealText,
      isDealActive: price.isDealActive,
      categories,
    });
  }

  return products;
}

async function scrapeCategory(
  path: string,
  label: string,
  seenKeys: Set<string>,
  reportProgress?: ScrapeProgressReporter,
) {
  const taxonomyMatch = path.match(/^\/producten\/(\d+)\//);

  if (!taxonomyMatch) {
    return [];
  }

  const taxonomyId = taxonomyMatch[1];
  const firstPageHtml = await fetchHtml(`${baseUrl}${path}`);
  const firstPageState = parseApolloState(firstPageHtml);
  const totalProducts = getProductTaxonomyCount(firstPageState, taxonomyId);
  const totalPages = Math.max(1, Math.ceil(totalProducts / 36));
  const pageLimit = getOptionalPageLimit();
  const finalPage = pageLimit ? Math.min(totalPages, pageLimit) : totalPages;
  console.log(`[AH] Category ${path} -> ${totalProducts} products across ${totalPages} pages${pageLimit ? ` (limited to ${finalPage})` : ""}`);
  const products = parseProductsFromState(firstPageState);
  let newProducts = 0;

  for (const product of products) {
    const key = getProductKey(product);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      newProducts += 1;
    }
  }

  console.log(`[AH] ${path} page 1/${finalPage}: ${products.length} products (${newProducts} new)`);
  await reportProgress?.({
    store: "AH",
    category: label,
    message: `AH ${label} page 1/${finalPage}`,
    pagesProcessed: 1,
    pagesExpected: finalPage,
    itemsDiscovered: newProducts,
    itemsExpected: totalProducts,
  });

  const remainingPages = Array.from({ length: Math.max(0, finalPage - 1) }, (_, index) => index + 2);
  const concurrency = Math.max(1, Number(process.env.AH_PAGE_CONCURRENCY ?? 4));

  const pageResults = await mapWithConcurrency(remainingPages, concurrency, async (page) => {
    try {
      const html = await fetchHtml(`${baseUrl}${path}?page=${page}&withOffset=true`);
      const state = parseApolloState(html);
      const pageProducts = parseProductsFromState(state);
      return { page, pageProducts, error: null };
    } catch (error) {
      return {
        page,
        pageProducts: [] as ScrapedProduct[],
        error: error instanceof Error ? error.message : `Failed page ${page}`,
      };
    }
  });

  for (const result of pageResults.sort((left, right) => left.page - right.page)) {
    if (result.error) {
      console.error(`[AH] ${path} page ${result.page}/${finalPage} failed: ${result.error}`);
      await reportProgress?.({
        store: "AH",
        category: label,
        message: `AH ${label} page ${result.page}/${finalPage} failed: ${result.error}`,
        pagesProcessed: 1,
        warning: true,
      });
      continue;
    }

    products.push(...result.pageProducts);
    let newPageProducts = 0;

    for (const product of result.pageProducts) {
      const key = getProductKey(product);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        newPageProducts += 1;
      }
    }

    console.log(`[AH] ${path} page ${result.page}/${finalPage}: ${result.pageProducts.length} products (${newPageProducts} new, running total ${products.length})`);
    await reportProgress?.({
      store: "AH",
      category: label,
      message: `AH ${label} page ${result.page}/${finalPage}`,
      pagesProcessed: 1,
      itemsDiscovered: newPageProducts,
    });
  }

  return products;
}

export async function scrapeAlbertHeijn(
  reportProgress?: ScrapeProgressReporter,
  selectedCategoryPaths?: string[],
): Promise<ScrapeResult> {
  await reportProgress?.({
    store: "AH",
    message: "AH loading categories",
    categoriesDone: 0,
  });

  if (selectedCategoryPaths && selectedCategoryPaths.length === 0) {
    await reportProgress?.({
      store: "AH",
      message: "AH skipped - no categories selected",
      categoriesDone: 0,
      categoriesTotal: 0,
    });

    return {
      supermarket: Supermarket.AH,
      products: [],
    };
  }

  const categories = await discoverAlbertHeijnCategories();
  const categoryLimit = Number(process.env.AH_CATEGORY_LIMIT ?? "");
  const filteredCategories = selectedCategoryPaths?.length
    ? categories.filter((category) => selectedCategoryPaths.includes(category.path))
    : categories;
  const finalCategories = Number.isFinite(categoryLimit) && categoryLimit > 0 ? filteredCategories.slice(0, categoryLimit) : filteredCategories;
  console.log(`[AH] Found ${categories.length} categories${finalCategories.length !== categories.length ? `, scraping first ${finalCategories.length}` : ""}`);
  await reportProgress?.({
    store: "AH",
    message: `AH discovered ${categories.length} categories`,
    categoriesTotal: finalCategories.length,
  });
  const products: ScrapedProduct[] = [];
  const seenKeys = new Set<string>();

  for (const [index, category] of finalCategories.entries()) {
    console.log(`[AH] Scraping category: ${category.label} (${category.path})`);
    await reportProgress?.({
      store: "AH",
      category: category.label,
      message: `AH scraping ${category.label}`,
      categoriesDone: index,
      categoriesTotal: finalCategories.length,
    });
    const categoryProducts = await scrapeCategory(category.path, category.label, seenKeys, reportProgress);
    products.push(...categoryProducts);
    console.log(`[AH] Completed ${category.label}: ${categoryProducts.length} products (overall ${products.length})`);
    await reportProgress?.({
      store: "AH",
      category: category.label,
      message: `AH completed ${category.label}`,
      categoriesDone: index + 1,
      categoriesTotal: finalCategories.length,
      itemsDiscovered: 0,
    });
  }

  console.log(`[AH] Finished scrape with ${products.length} products`);

  return {
    supermarket: Supermarket.AH,
    products,
  };
}
