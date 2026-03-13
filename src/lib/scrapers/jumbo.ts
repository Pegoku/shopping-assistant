import { Supermarket } from "@prisma/client";
import type { ScrapeProgressReporter, ScrapeResult, ScrapedProduct } from "@/lib/scrapers/types";
import {
  absoluteUrl,
  fetchHtml,
  type CategoryLink,
  parseCategoryLinksFromHtml,
  parseQuantity,
  textContent,
} from "@/lib/scrapers/utils";

const baseUrl = "https://www.jumbo.com";
const graphqlUrl = `${baseUrl}/api/graphql`;
const supplementalJumboListings: CategoryLink[] = [
  {
    label: "Jumbo brand listing",
    path: "/producten/jumbo/",
  },
];

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

type JumboSearchResponse = {
  data?: {
    searchProducts?: {
      count?: number;
      products?: Array<{
        id?: string;
        title?: string;
        subtitle?: string;
        category?: string;
        image?: string;
        link?: string;
        prices?: {
          price?: number;
          promoPrice?: number | null;
          pricePerUnit?: {
            price?: number;
            unit?: string;
          } | null;
        } | null;
        promotions?: Array<{
          tags?: Array<{ text?: string | null } | null> | null;
          durationTexts?: Array<{ shortTitle?: string | null } | null> | null;
        }> | null;
      }>;
    };
  };
};

type JumboApiProduct = NonNullable<NonNullable<NonNullable<JumboSearchResponse["data"]>["searchProducts"]>["products"]>[number];

function asArray<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}

const searchProductsQuery = `
  query SearchProducts($input: ProductSearchInput!) {
    searchProducts(input: $input) {
      count
      start
      products {
        id: sku
        category: rootCategory
        subtitle: packSizeDisplay
        title
        image
        link
        prices: price {
          price
          promoPrice
          pricePerUnit {
            price
            unit
          }
        }
        promotions {
          tags {
            text
          }
          durationTexts {
            shortTitle
          }
        }
      }
    }
  }
`;

export async function discoverJumboCategories(): Promise<CategoryLink[]> {
  const html = await fetchHtml(`${baseUrl}/producten`);
  const categories = parseCategoryLinksFromHtml(
    html,
    (path) => path.startsWith("/producten/") && path !== "/producten" && path !== "/producten/" && path.endsWith("/"),
  ).filter(
    (category) =>
      !category.path.includes("/producten/jumbo/") &&
      !category.path.includes("/producten/jumbos/") &&
      !category.path.includes("/producten/aanbiedingen") &&
      !category.path.includes("/producten/jumbo/") &&
      !category.label.includes("resultaten - unchecked"),
  );

  if (process.env.JUMBO_INCLUDE_BRAND_LISTING === "false") {
    return categories;
  }

  return [...categories, ...supplementalJumboListings];
}

function getProductKey(product: ScrapedProduct) {
  return product.sourceUrl ?? product.sourceId ?? `${product.originalName}::${product.quantityText}`;
}

function normalizeUnitFromJumbo(unit: string | undefined | null) {
  if (!unit) {
    return undefined;
  }

  const normalized = unit.trim().toLowerCase();

  if (normalized.includes("kg") || normalized.includes("kilo")) {
    return "kg";
  }

  if (normalized.includes("l") || normalized.includes("liter")) {
    return "l";
  }

  if (normalized.includes("stuk")) {
    return "piece";
  }

  return normalized;
}

function normalizeMoney(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value / 100;
}

function isScrapedProduct(value: ScrapedProduct | null): value is ScrapedProduct {
  return value !== null;
}

function parseProduct(product: JumboApiProduct, categoryLabel: string): ScrapedProduct | null {
  const originalName = textContent(product.title);
  const quantityText = textContent(product.subtitle) || "per item";
  const quantity = parseQuantity(quantityText);
  const currentPrice = normalizeMoney(product.prices?.promoPrice ?? product.prices?.price);

  if (!originalName || currentPrice === undefined || currentPrice === null) {
    return null;
  }

  const promotionText = textContent(
    (product.promotions ?? [])
      .flatMap((promotion) => [
        ...asArray(promotion?.tags).map((tag: { text?: string | null } | null) => textContent(tag?.text)),
        ...asArray(promotion?.durationTexts).map((item: { shortTitle?: string | null } | null) => textContent(item?.shortTitle)),
      ])
      .filter(Boolean)
      .join(" • "),
  );

  return {
    supermarket: Supermarket.JUMBO,
    sourceId: product.id ?? undefined,
    originalName,
    quantityText,
    unitAmount: quantity.unitAmount,
    normalizedUnit: quantity.normalizedUnit ?? normalizeUnitFromJumbo(product.prices?.pricePerUnit?.unit),
    currentPrice,
    currentUnitPrice: normalizeMoney(product.prices?.pricePerUnit?.price),
    imageUrl: absoluteUrl(baseUrl, product.image),
    sourceUrl: absoluteUrl(baseUrl, product.link),
    dealText: promotionText || undefined,
    isDealActive:
      Boolean(product.prices?.promoPrice && product.prices?.price && product.prices.promoPrice < product.prices.price) || Boolean(promotionText),
    categories: [categoryLabel],
  };
}

async function fetchCategoryPage(category: { label: string; path: string }, offSet: number) {
  const friendlyUrl = category.path.replace(/^\/producten\//, "");
  const urlSuffix = offSet > 0 ? `${friendlyUrl}?offSet=${offSet}` : friendlyUrl;
  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apollographql-client-name": "JUMBO_WEB-search",
      "apollographql-client-version": "master-v30.11.0-web",
      origin: baseUrl,
      referer: `${baseUrl}${category.path}`,
      "x-source": "JUMBO_WEB-search",
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({
      operationName: "SearchProducts",
      variables: {
        input: {
          searchType: "category",
          searchTerms: "producten",
          friendlyUrl: urlSuffix,
          offSet,
          currentUrl: `/producten/${urlSuffix}`,
          previousUrl: "",
          bloomreachCookieId: "",
        },
      },
      query: searchProductsQuery,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Jumbo GraphQL category page ${category.path} offset ${offSet}: ${response.status}`);
  }

  return (await response.json()) as JumboSearchResponse;
}

async function scrapeCategory(
  category: { label: string; path: string },
  seenKeys: Set<string>,
  reportProgress?: ScrapeProgressReporter,
) {
  const firstPage = await fetchCategoryPage(category, 0);
  const totalProducts = firstPage.data?.searchProducts?.count ?? 0;
  const firstProducts = (firstPage.data?.searchProducts?.products ?? [])
    .map((product) => parseProduct(product, category.label))
    .filter(isScrapedProduct);
  const pageSize = Math.max(firstProducts.length, 1);
  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));
  console.log(`[JUMBO] Category ${category.label} (${category.path}) -> ${totalProducts} products across ${totalPages} pages`);

  const products = [...firstProducts];
  let newProducts = 0;

  for (const product of firstProducts) {
    const key = getProductKey(product);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      newProducts += 1;
    }
  }

  console.log(`[JUMBO] ${category.label} page 1/${totalPages}: ${firstProducts.length} products (${newProducts} new, unique total ${seenKeys.size})`);
  await reportProgress?.({
    store: "JUMBO",
    category: category.label,
    message: `Jumbo ${category.label} page 1/${totalPages}`,
    pagesProcessed: 1,
    pagesExpected: totalPages,
    itemsDiscovered: newProducts,
    itemsExpected: totalProducts,
  });

  const remainingPages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 2);
  const concurrency = Math.max(1, Number(process.env.JUMBO_PAGE_CONCURRENCY ?? 8));

  const pageResults = await mapWithConcurrency(remainingPages, concurrency, async (page) => {
    const offSet = (page - 1) * pageSize;

    try {
      const pageResponse = await fetchCategoryPage(category, offSet);
      const pageProducts = (pageResponse.data?.searchProducts?.products ?? [])
        .map((product) => parseProduct(product, category.label))
        .filter(isScrapedProduct);

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
      console.error(`[JUMBO] ${category.label} page ${result.page}/${totalPages} failed: ${result.error}`);
      await reportProgress?.({
        store: "JUMBO",
        category: category.label,
        message: `Jumbo ${category.label} page ${result.page}/${totalPages} failed: ${result.error}`,
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

    console.log(`[JUMBO] ${category.label} page ${result.page}/${totalPages}: ${result.pageProducts.length} products (${newPageProducts} new, unique total ${seenKeys.size})`);
    await reportProgress?.({
      store: "JUMBO",
      category: category.label,
      message: `Jumbo ${category.label} page ${result.page}/${totalPages}`,
      pagesProcessed: 1,
      itemsDiscovered: newPageProducts,
    });
  }

  return products;
}

export async function scrapeJumbo(
  reportProgress?: ScrapeProgressReporter,
  selectedCategoryPaths?: string[],
): Promise<ScrapeResult> {
  await reportProgress?.({
    store: "JUMBO",
    message: "Jumbo loading categories",
    categoriesDone: 0,
  });

  if (selectedCategoryPaths && selectedCategoryPaths.length === 0) {
    await reportProgress?.({
      store: "JUMBO",
      message: "Jumbo skipped - no categories selected",
      categoriesDone: 0,
      categoriesTotal: 0,
    });

    return {
      supermarket: Supermarket.JUMBO,
      products: [],
    };
  }

  const categories = await discoverJumboCategories();
  const categoryLimit = Number(process.env.JUMBO_CATEGORY_LIMIT ?? "");
  const filteredCategories = selectedCategoryPaths?.length
    ? categories.filter((category) => selectedCategoryPaths.includes(category.path))
    : categories;
  const finalCategories = Number.isFinite(categoryLimit) && categoryLimit > 0 ? filteredCategories.slice(0, categoryLimit) : filteredCategories;
  console.log(`[JUMBO] Found ${categories.length} categories${finalCategories.length !== categories.length ? `, scraping first ${finalCategories.length}` : ""}`);
  await reportProgress?.({
    store: "JUMBO",
    message: `Jumbo discovered ${categories.length} categories`,
    categoriesTotal: finalCategories.length,
  });

  const products: ScrapedProduct[] = [];
  const seenKeys = new Set<string>();

  for (const [index, category] of finalCategories.entries()) {
    console.log(`[JUMBO] Scraping category: ${category.label}`);
    await reportProgress?.({
      store: "JUMBO",
      category: category.label,
      message: `Jumbo scraping ${category.label}`,
      categoriesDone: index,
      categoriesTotal: finalCategories.length,
    });

    const categoryProducts = await scrapeCategory(category, seenKeys, reportProgress);
    products.push(...categoryProducts);
    console.log(`[JUMBO] Completed ${category.label}: ${categoryProducts.length} raw products (${seenKeys.size} unique overall)`);
    await reportProgress?.({
      store: "JUMBO",
      category: category.label,
      message: `Jumbo completed ${category.label}`,
      categoriesDone: index + 1,
      categoriesTotal: finalCategories.length,
    });
  }

  console.log(`[JUMBO] Finished scrape with ${products.length} products`);

  return {
    supermarket: Supermarket.JUMBO,
    products,
  };
}
