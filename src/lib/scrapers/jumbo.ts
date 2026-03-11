import { Supermarket } from "@prisma/client";
import { load } from "cheerio";
import type { ScrapeProgressReporter, ScrapeResult, ScrapedProduct } from "@/lib/scrapers/types";
import {
  absoluteUrl,
  fetchHtml,
  getOptionalPageLimit,
  type CategoryLink,
  parseCategoryLinksFromHtml,
  parsePriceLabel,
  parseQuantity,
  parseUnitPrice,
  textContent,
} from "@/lib/scrapers/utils";

const baseUrl = "https://www.jumbo.com";
const nonDealBadges = new Set(["nieuw", "bekroond", "van dichtbij"]);

export async function discoverJumboCategories(): Promise<CategoryLink[]> {
  const html = await fetchHtml(`${baseUrl}/producten`);
  return parseCategoryLinksFromHtml(
    html,
    (path) => path.startsWith("/producten/") && path !== "/producten" && path !== "/producten/" && path.endsWith("/"),
  ).filter(
    (category) =>
      !category.path.includes("/producten/jumbo/") &&
      !category.path.includes("/producten/jumbos/") &&
      !category.path.includes("/producten/aanbiedingen") &&
      !category.label.includes("resultaten - unchecked"),
  );
}

function getTotalPages(html: string) {
  const matches = Array.from(html.matchAll(/data-testid="page-(\d+)"/g)).map((match) => Number(match[1]));
  return Math.max(1, ...matches.filter(Number.isFinite));
}

function parseProductsFromHtml(html: string, categoryLabel: string) {
  const $ = load(html);
  const products: ScrapedProduct[] = [];

  $(".product-card[data-product-id]").each((_, element) => {
    const root = $(element);
    const originalName = textContent(root.find(".title-link").first().text());
    let quantityText = textContent(root.find('[data-testid="jum-card-subtitle"]').first().text()) || "per item";
    const priceText = textContent(root.find(".current-price .screenreader-only").first().text());
    const unitPriceText = textContent(root.find(".price-per-unit .screenreader-only").first().text());
    const oldPriceText = textContent(root.find(".promo-price .screenreader-only").first().text());
    const tags = root
      .find(".product-tags .tag-line, .card-promotion, .promotion-description")
      .map((__, node) => textContent($(node).text()))
      .get()
      .filter(Boolean);
    const href = root.find("a.title-link, a.link").first().attr("href");
    const imageUrl = root.find('img[data-testid="jum-product-image"]').attr("src");
    const currentPrice = parsePriceLabel(priceText);

    if (!originalName || currentPrice === undefined) {
      return;
    }

    const unitPrice = parseUnitPrice(unitPriceText);
    let quantity = parseQuantity(quantityText);

    if (quantity.unitAmount === undefined) {
      const fallbackQuantity = parseQuantity(originalName);

      if (fallbackQuantity.unitAmount !== undefined) {
        quantity = fallbackQuantity;
        const fromName = originalName.match(/(\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl|stuk|stuks))/i)?.[1];

        if (fromName) {
          quantityText = fromName;
        }
      }
    }

    const oldPrice = parsePriceLabel(oldPriceText);
    const meaningfulTags = tags.filter((tag) => !nonDealBadges.has(tag.toLowerCase()));
    const dealText = textContent(meaningfulTags.join(" • ")) || undefined;

    products.push({
      supermarket: Supermarket.JUMBO,
      sourceId: root.attr("data-product-id") ?? undefined,
      originalName,
      quantityText,
      unitAmount: quantity.unitAmount,
      normalizedUnit: quantity.normalizedUnit ?? unitPrice.unit,
      currentPrice,
      currentUnitPrice: unitPrice.amount,
      imageUrl,
      sourceUrl: absoluteUrl(baseUrl, href),
      dealText,
      isDealActive: Boolean(dealText) || Boolean(oldPrice && oldPrice > currentPrice),
      categories: [categoryLabel],
    });
  });

  return products;
}

async function scrapeCategory(category: { label: string; path: string }, reportProgress?: ScrapeProgressReporter) {
  const firstPageHtml = await fetchHtml(`${baseUrl}${category.path}`);
  const pageLimit = getOptionalPageLimit();
  const totalPages = getTotalPages(firstPageHtml);
  const finalPage = pageLimit ? Math.min(totalPages, pageLimit) : totalPages;
  console.log(`[JUMBO] Category ${category.label} (${category.path}) -> ${totalPages} pages${pageLimit ? ` (limited to ${finalPage})` : ""}`);
  const products = parseProductsFromHtml(firstPageHtml, category.label);
  console.log(`[JUMBO] ${category.label} page 1/${finalPage}: ${products.length} products`);
  await reportProgress?.({
    store: "JUMBO",
    category: category.label,
    message: `Jumbo ${category.label} page 1/${finalPage}`,
    pagesProcessed: 1,
    pagesExpected: finalPage,
    itemsDiscovered: products.length,
  });

  for (let page = 2; page <= finalPage; page += 1) {
    try {
      const html = await fetchHtml(`${baseUrl}${category.path}?page=${page}`);
      const pageProducts = parseProductsFromHtml(html, category.label);
      products.push(...pageProducts);
      console.log(`[JUMBO] ${category.label} page ${page}/${finalPage}: ${pageProducts.length} products (running total ${products.length})`);
      await reportProgress?.({
        store: "JUMBO",
        category: category.label,
        message: `Jumbo ${category.label} page ${page}/${finalPage}`,
        pagesProcessed: 1,
        itemsDiscovered: pageProducts.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed page ${page}`;
      console.error(`[JUMBO] ${category.label} page ${page}/${finalPage} failed: ${message}`);
      await reportProgress?.({
        store: "JUMBO",
        category: category.label,
        message: `Jumbo ${category.label} page ${page}/${finalPage} failed: ${message}`,
        pagesProcessed: 1,
        warning: true,
      });
    }
  }

  return products;
}

export async function scrapeJumbo(
  reportProgress?: ScrapeProgressReporter,
  selectedCategoryPaths?: string[],
): Promise<ScrapeResult> {
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

  for (const [index, category] of finalCategories.entries()) {
    console.log(`[JUMBO] Scraping category: ${category.label}`);
    await reportProgress?.({
      store: "JUMBO",
      category: category.label,
      message: `Jumbo scraping ${category.label}`,
      categoriesDone: index,
      categoriesTotal: finalCategories.length,
    });
    const categoryProducts = await scrapeCategory(category, reportProgress);
    products.push(...categoryProducts);
    console.log(`[JUMBO] Completed ${category.label}: ${categoryProducts.length} products (overall ${products.length})`);
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
