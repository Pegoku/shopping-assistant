export type Language = "en" | "es";

export type ProductCardData = {
  id: string;
  supermarket: "AH" | "JUMBO";
  originalName: string;
  genericNameEn: string;
  genericNameEs: string;
  quantityText: string;
  currentPrice: number;
  currentUnitPrice: number | null;
  imageUrl: string | null;
  dealText: string | null;
  isDealActive: boolean;
  categories: string[];
  lastFetchedAt: string | null;
  dayOverDayPct: number | null;
  weekOverWeekPct: number | null;
  sourceUrl: string | null;
  priceHistory: Array<{
    capturedAt: string;
    price: number;
  }>;
};

export type CartItem = {
  id: string;
  originalName: string;
  genericNameEn: string;
  genericNameEs: string;
  supermarket: "AH" | "JUMBO";
  currentPrice: number;
  quantityText: string;
  imageUrl: string | null;
};

export type FetchRunSummary = {
  id: string;
  status: string;
  sourceMode: string;
  startedAt: string;
  completedAt: string | null;
  itemsFetched: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsDiscovered: number;
  itemsExpected: number | null;
  pagesProcessed: number;
  pagesExpected: number | null;
  categoriesDone: number;
  categoriesTotal: number | null;
  currentStore: string | null;
  currentCategory: string | null;
  currentMessage: string | null;
  progressPercent: number;
  warningCount: number;
  errorMessage: string | null;
};
