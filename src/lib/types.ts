export type Language = "en" | "es";

export type ProductCardData = {
  id: string;
  supermarket: "AH" | "JUMBO";
  originalName: string;
  genericNameEn: string;
  genericNameEs: string;
  quantityText: string;
  normalizedUnit: string | null;
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

export type ProductSortMode = "relevance" | "price" | "unitPrice" | "dayChange" | "weekChange";

export type ProductQueryInput = {
  search?: string;
  sort?: ProductSortMode;
  supermarket?: "all" | "AH" | "JUMBO";
  dealsOnly?: boolean;
  offset?: number;
  limit?: number;
  priceHint?: number;
};

export type ProductQueryResult = {
  products: ProductCardData[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export type RecommendationSortMode = "unitPrice" | "price";

export type RequestedItem = {
  originalText: string;
  normalizedEn: string;
  normalizedEs: string;
};

export type RecommendedItemGroup = {
  request: RequestedItem;
  options: ProductCardData[];
};

export type RecommendationResult = {
  items: RequestedItem[];
  groups: RecommendedItemGroup[];
  sort: RecommendationSortMode;
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
  quantity: number;
};

export type FavouriteItem = CartItem;

export type PastOrderPack = {
  id: string;
  sentAt: string;
  recipient: string | null;
  items: CartItem[];
};

export type PersonData = {
  id: string;
  name: string;
};

export type PastOrderShareData = {
  personId: string;
  personName: string;
  percent: number;
};

export type PastOrderItemData = {
  id: string;
  receiptName: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  dealText: string | null;
  aiConfidence: number | null;
  product: ProductCardData | null;
  shares: PastOrderShareData[];
};

export type SettlementRow = {
  fromPersonId: string;
  fromName: string;
  toPersonId: string;
  toName: string;
  amount: number;
  paidAt: string | null;
};

export type PastOrderData = {
  id: string;
  supermarket: "AH" | "JUMBO";
  source: "MANUAL" | "AI_RECEIPT" | "WHATSAPP";
  orderedAt: string;
  total: number;
  rawReceiptText: string | null;
  receiptImageName: string | null;
  payer: PersonData | null;
  items: PastOrderItemData[];
  settlement: SettlementRow[];
};

export type ReceiptScanItem = {
  receiptName: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  dealText: string | null;
  product: ProductCardData | null;
  aiConfidence: number | null;
};

export type ReceiptScanResult = {
  supermarket: "AH" | "JUMBO";
  orderedAt: string | null;
  total: number | null;
  rawReceiptText: string | null;
  items: ReceiptScanItem[];
  notes: string | null;
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
  stores: {
    AH: FetchRunStoreSummary;
    JUMBO: FetchRunStoreSummary;
  };
};

export type FetchRunStoreSummary = {
  categoriesDone: number;
  categoriesTotal: number | null;
  pagesProcessed: number;
  pagesExpected: number | null;
  itemsFound: number;
  warnings: number;
  currentCategory: string | null;
  currentMessage: string | null;
  completedAt: string | null;
};
