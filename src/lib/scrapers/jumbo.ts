import { Supermarket } from "@prisma/client";
import { load } from "cheerio";
import type { ScrapeResult, ScrapedProduct } from "@/lib/scrapers/types";
import {
  absoluteUrl,
  fetchHtml,
  getOptionalPageLimit,
  parseCategoryLinksFromHtml,
  parsePriceLabel,
  parseQuantity,
  parseUnitPrice,
  textContent,
} from "@/lib/scrapers/utils";

const baseUrl = "https://www.jumbo.com";
const nonDealBadges = new Set(["nieuw", "bekroond", "van dichtbij"]);

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

async function scrapeCategory(category: { label: string; path: string }) {
  const firstPageHtml = await fetchHtml(`${baseUrl}${category.path}`);
  const pageLimit = getOptionalPageLimit();
  const totalPages = getTotalPages(firstPageHtml);
  const finalPage = pageLimit ? Math.min(totalPages, pageLimit) : totalPages;
  const products = parseProductsFromHtml(firstPageHtml, category.label);

  for (let page = 2; page <= finalPage; page += 1) {
    const html = await fetchHtml(`${baseUrl}${category.path}?page=${page}`);
    products.push(...parseProductsFromHtml(html, category.label));
  }

  return products;
}

export async function scrapeJumbo(): Promise<ScrapeResult> {
  const html = await fetchHtml(`${baseUrl}/producten`);
  const categories = parseCategoryLinksFromHtml(
    html,
    (path) => path.startsWith("/producten/") && path !== "/producten" && path !== "/producten/" && path.endsWith("/"),
  ).filter(
    (category) =>
      !category.path.includes("/producten/jumbo/") &&
      !category.path.includes("/producten/jumbos/") &&
      !category.path.includes("/producten/aanbiedingen") &&
      !category.label.includes("resultaten - unchecked"),
  );
  const categoryLimit = Number(process.env.JUMBO_CATEGORY_LIMIT ?? "");
  const finalCategories = Number.isFinite(categoryLimit) && categoryLimit > 0 ? categories.slice(0, categoryLimit) : categories;
  const products: ScrapedProduct[] = [];

  for (const category of finalCategories) {
    products.push(...(await scrapeCategory(category)));
  }

  return {
    supermarket: Supermarket.JUMBO,
    products,
  };
}
