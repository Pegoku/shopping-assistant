import { load } from "cheerio";

export type CategoryLink = {
  label: string;
  path: string;
};

export async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "nl-NL,nl;q=0.9,en;q=0.8",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

export function absoluteUrl(baseUrl: string, path: string | undefined | null) {
  if (!path) {
    return undefined;
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  if (path.startsWith("//")) {
    return `https:${path}`;
  }

  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function toNumber(value: string | undefined | null) {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parsePriceLabel(label: string | undefined | null) {
  return toNumber(label?.replace(/Prijs:\s*/i, "").replace(/Oude prijs:\s*/i, "").replace(/Nieuwe prijs:\s*/i, ""));
}

export function normalizeUnitLabel(unit: string | undefined | null) {
  if (!unit) {
    return undefined;
  }

  const value = unit.trim().toLowerCase();

  if (value.includes("kilo") || value === "kg") {
    return "kg";
  }

  if (value.includes("liter") || value === "l") {
    return "l";
  }

  if (value.includes("stuk")) {
    return "piece";
  }

  if (value.includes("meter")) {
    return "m";
  }

  return value;
}

export function parseQuantity(quantityText: string | undefined | null) {
  if (!quantityText) {
    return { unitAmount: undefined, normalizedUnit: undefined };
  }

  const text = quantityText.trim().toLowerCase();
  const multiMatch = text.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl|stuk|stuks)/i);

  if (multiMatch) {
    const left = toNumber(multiMatch[1]) ?? 0;
    const right = toNumber(multiMatch[2]) ?? 0;
    return convertUnit(left * right, multiMatch[3]);
  }

  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl|stuk|stuks)/i);

  if (!match) {
    return { unitAmount: undefined, normalizedUnit: undefined };
  }

  return convertUnit(toNumber(match[1]) ?? 0, match[2]);
}

function convertUnit(amount: number, unit: string) {
  const normalized = unit.toLowerCase();

  if (normalized === "g") {
    return { unitAmount: amount / 1000, normalizedUnit: "kg" };
  }

  if (normalized === "ml") {
    return { unitAmount: amount / 1000, normalizedUnit: "l" };
  }

  if (normalized === "cl") {
    return { unitAmount: amount / 100, normalizedUnit: "l" };
  }

  if (normalized === "stuk" || normalized === "stuks") {
    return { unitAmount: amount, normalizedUnit: "piece" };
  }

  return { unitAmount: amount, normalizedUnit: normalizeUnitLabel(unit) };
}

export function parseUnitPrice(label: string | undefined | null) {
  if (!label) {
    return { amount: undefined, unit: undefined };
  }

  const amount = toNumber(label);
  const unitMatch = label.match(/per\s+([a-zA-Z]+)/i) ?? label.match(/\/\s*([a-zA-Z]+)/i);

  return {
    amount,
    unit: normalizeUnitLabel(unitMatch?.[1]),
  };
}

export function textContent(value: string | undefined | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function parseCategoryLinksFromHtml(
  html: string,
  filter: (path: string) => boolean,
) {
  const $ = load(html);
  const links = new Map<string, CategoryLink>();

  $("a[href]").each((_, element) => {
    const path = $(element).attr("href");
    const label = textContent($(element).text());

    if (!path || !label || !filter(path)) {
      return;
    }

    links.set(path, { path, label });
  });

  return Array.from(links.values());
}

export function getOptionalPageLimit() {
  const limit = Number(process.env.SCRAPER_MAX_PAGES ?? "");
  return Number.isFinite(limit) && limit > 0 ? limit : undefined;
}
