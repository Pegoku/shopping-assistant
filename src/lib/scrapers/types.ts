import type { Supermarket } from "@prisma/client";

export type ScrapedProduct = {
  supermarket: Supermarket;
  originalName: string;
  genericNameEn?: string;
  genericNameEs?: string;
  sourceId?: string;
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

export type ScrapeProgressEvent = {
  store?: "AH" | "JUMBO";
  category?: string;
  message: string;
  pagesProcessed?: number;
  pagesExpected?: number;
  categoriesDone?: number;
  categoriesTotal?: number;
  itemsDiscovered?: number;
  itemsExpected?: number;
  warning?: boolean;
};

export type ScrapeProgressReporter = (event: ScrapeProgressEvent) => Promise<void>;
