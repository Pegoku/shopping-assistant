import { Supermarket } from "@prisma/client";
import { load } from "cheerio";
import { generateGenericNames } from "@/lib/ai/generic-name";
import { prisma } from "@/lib/db";
import { mapProductCard } from "@/lib/queries";
import { absoluteUrl, fetchHtml, parseQuantity, toNumber, textContent } from "@/lib/scrapers/utils";

function detectStore(url: URL) {
  if (url.hostname.includes("jumbo.com")) {
    return Supermarket.JUMBO;
  }

  if (url.hostname.includes("ah.nl")) {
    return Supermarket.AH;
  }

  return null;
}

function pickMeta($: ReturnType<typeof load>, names: string[]) {
  for (const name of names) {
    const value = $(`meta[property="${name}"], meta[name="${name}"]`).attr("content");

    if (value?.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function parsePrice($: ReturnType<typeof load>, html: string) {
  const metaPrice = toNumber(pickMeta($, ["product:price:amount", "og:price:amount"]));

  if (metaPrice !== undefined) {
    return metaPrice;
  }

  const text = textContent($("body").text()) || html;
  const match = text.match(/(?:€|EUR)\s*(\d+[,.]\d{2})/) ?? text.match(/(\d+[,.]\d{2})\s*(?:€|euro)/i);
  return toNumber(match?.[1]);
}

function parseQuantityText($: ReturnType<typeof load>) {
  const candidates = [
    pickMeta($, ["product:retailer_item_id"]),
    textContent($('[data-testid*="quantity" i]').first().text()),
    textContent($('[class*="quantity" i]').first().text()),
    textContent($('[class*="subtitle" i]').first().text()),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => /\d/.test(candidate)) ?? "per item";
}

export async function importProductFromUrl(input: { url: string; supermarket?: Supermarket | null }) {
  const url = new URL(input.url);
  const supermarket = detectStore(url);

  if (!supermarket) {
    throw new Error("Only AH and Jumbo product URLs can be imported");
  }

  if (input.supermarket && input.supermarket !== supermarket) {
    throw new Error(`This is a ${supermarket} URL, but the order is for ${input.supermarket}`);
  }

  const html = await fetchHtml(url.toString());
  const $ = load(html);
  const originalName = textContent(pickMeta($, ["og:title", "twitter:title"]) ?? $("h1").first().text()).replace(/\s+\|\s+.*$/, "");
  const currentPrice = parsePrice($, html);
  const imageUrl = absoluteUrl(url.origin, pickMeta($, ["og:image", "twitter:image"]));
  const sourceUrl = pickMeta($, ["og:url"]) ?? url.toString();
  const quantityText = parseQuantityText($);
  const quantity = parseQuantity(quantityText);

  if (!originalName || currentPrice === undefined) {
    throw new Error("Could not read product name and price from that URL");
  }

  const generic = await generateGenericNames(originalName);
  const existing = await prisma.product.findFirst({ where: { supermarket, sourceUrl } });
  const product = existing
    ? await prisma.product.update({
        where: { id: existing.id },
        data: {
          originalName,
          genericNameEn: generic.english,
          genericNameEs: generic.spanish,
          quantityText,
          unitAmount: quantity.unitAmount,
          normalizedUnit: quantity.normalizedUnit,
          currentPrice,
          imageUrl,
          lastFetchedAt: new Date(),
        },
        include: {
          categories: { include: { category: true } },
          priceHistory: { orderBy: { capturedAt: "desc" }, take: 8 },
        },
      })
    : await prisma.product.create({
        data: {
          supermarket,
          originalName,
          genericNameEn: generic.english,
          genericNameEs: generic.spanish,
          quantityText,
          unitAmount: quantity.unitAmount,
          normalizedUnit: quantity.normalizedUnit,
          currentPrice,
          imageUrl,
          sourceUrl,
          lastFetchedAt: new Date(),
        },
        include: {
          categories: { include: { category: true } },
          priceHistory: { orderBy: { capturedAt: "desc" }, take: 8 },
        },
      });

  await prisma.priceHistory.create({
    data: {
      productId: product.id,
      price: currentPrice,
      unitPrice: product.currentUnitPrice,
      isDeal: product.isDealActive,
      dealText: product.dealText,
    },
  });

  return mapProductCard(product);
}
