import { Supermarket } from "@prisma/client";
import type { ScrapeResult, ScrapedProduct } from "@/lib/scrapers/types";
import {
  absoluteUrl,
  fetchHtml,
  getOptionalPageLimit,
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

async function scrapeCategory(path: string) {
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
  const products = parseProductsFromState(firstPageState);

  for (let page = 2; page <= finalPage; page += 1) {
    const html = await fetchHtml(`${baseUrl}${path}?page=${page}&withOffset=true`);
    const state = parseApolloState(html);
    products.push(...parseProductsFromState(state));
  }

  return products;
}

export async function scrapeAlbertHeijn(): Promise<ScrapeResult> {
  const html = await fetchHtml(`${baseUrl}/producten`);
  const categories = parseCategoryLinksFromHtml(
    html,
    (path) => /^\/producten\/\d+\//.test(path) && !path.includes("/producten/product/"),
  );
  const categoryLimit = Number(process.env.AH_CATEGORY_LIMIT ?? "");
  const finalCategories = Number.isFinite(categoryLimit) && categoryLimit > 0 ? categories.slice(0, categoryLimit) : categories;
  const products: ScrapedProduct[] = [];

  for (const category of finalCategories) {
    products.push(...(await scrapeCategory(category.path)));
  }

  return {
    supermarket: Supermarket.AH,
    products,
  };
}
