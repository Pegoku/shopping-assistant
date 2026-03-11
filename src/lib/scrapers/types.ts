import type { Supermarket } from "@prisma/client";

export type ScrapedProduct = {
  supermarket: Supermarket;
  originalName: string;
  genericNameEn?: string;
  genericNameEs?: string;
  quantityText: string;
  unitAmount?: number;
  normalizedUnit?: string;
  currentPrice: number;
  currentUnitPrice?: number;
  imageUrl?: string;
  sourceUrl?: string;
  dealText?: string;
  isDealActive?: boolean;
  categories?: string[];
};

export type ScrapeResult = {
  supermarket: Supermarket;
  products: ScrapedProduct[];
};
