import { prisma } from "@/lib/db";
import { parseShoppingRequest } from "@/lib/ai/shopping-intent";
import type {
  FetchRunStoreSummary,
  FetchRunSummary,
  ProductCardData,
  ProductQueryInput,
  ProductQueryResult,
  RecommendationResult,
  RecommendationSortMode,
  RequestedItem,
  ProductSortMode,
} from "@/lib/types";

function isMissingTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

function percentageChange(current: number, previous: number | null) {
  if (!previous || previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function nearestHistoryPrice(
  history: Array<{ capturedAt: Date; price: number }>,
  minimumAgeDays: number,
) {
  const threshold = Date.now() - minimumAgeDays * 24 * 60 * 60 * 1000;

  for (const entry of history) {
    if (entry.capturedAt.getTime() <= threshold) {
      return entry.price;
    }
  }

  return null;
}

function mapProductCard(product: {
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
  lastFetchedAt: Date | null;
  sourceUrl: string | null;
  categories: Array<{ category: { label: string } }>;
  priceHistory: Array<{ capturedAt: Date; price: number }>;
}): ProductCardData {
  const dayPrice = nearestHistoryPrice(product.priceHistory, 1);
  const weekPrice = nearestHistoryPrice(product.priceHistory, 7);

  return {
    id: product.id,
    supermarket: product.supermarket,
    originalName: product.originalName,
    genericNameEn: product.genericNameEn,
    genericNameEs: product.genericNameEs,
    quantityText: product.quantityText,
    normalizedUnit: product.normalizedUnit,
    currentPrice: product.currentPrice,
    currentUnitPrice: product.currentUnitPrice,
    imageUrl: product.imageUrl,
    dealText: product.dealText,
    isDealActive: product.isDealActive,
    categories: product.categories.map((item) => item.category.label),
    lastFetchedAt: product.lastFetchedAt?.toISOString() ?? null,
    dayOverDayPct: percentageChange(product.currentPrice, dayPrice),
    weekOverWeekPct: percentageChange(product.currentPrice, weekPrice),
    sourceUrl: product.sourceUrl,
    priceHistory: product.priceHistory
      .slice(0, 8)
      .reverse()
      .map((entry) => ({
        capturedAt: entry.capturedAt.toISOString(),
        price: entry.price,
      })),
  };
}

function getOrderBy(sort: ProductSortMode) {
  if (sort === "price") {
    return [{ currentPrice: "asc" as const }, { genericNameEn: "asc" as const }];
  }

  if (sort === "unitPrice") {
    return [{ currentUnitPrice: "asc" as const }, { genericNameEn: "asc" as const }];
  }

  return [{ genericNameEn: "asc" as const }, { currentPrice: "asc" as const }];
}

function rankRecommendationMatch(product: ProductCardData, request: RequestedItem) {
  const genericEn = product.genericNameEn.toLowerCase();
  const genericEs = product.genericNameEs.toLowerCase();
  const original = product.originalName.toLowerCase();
  const candidates = [request.originalText, request.normalizedEn, request.normalizedEs]
    .map((item) => item.toLowerCase())
    .filter(Boolean);

  let score = 0;

  for (const candidate of candidates) {
    if (genericEn === candidate || genericEs === candidate) {
      score += 30;
    }
    if (genericEn.includes(candidate) || genericEs.includes(candidate)) {
      score += 12;
    }
    if (original.includes(candidate)) {
      score += 8;
    }
  }

  if (product.isDealActive) {
    score += 3;
  }

  return score;
}

export async function getProducts(input: ProductQueryInput = {}): Promise<ProductQueryResult> {
  let products;
  let total;
  const limit = Math.min(Math.max(input.limit ?? 48, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const search = input.search?.trim();
  const sort = input.sort ?? "relevance";
  const where = {
    ...(input.supermarket && input.supermarket !== "all" ? { supermarket: input.supermarket } : {}),
    ...(input.dealsOnly ? { isDealActive: true } : {}),
    ...(search
      ? {
          OR: [
            { originalName: { contains: search } },
            { genericNameEn: { contains: search } },
            { genericNameEs: { contains: search } },
            {
              categories: {
                some: {
                  category: {
                    label: { contains: search },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  try {
    [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          categories: {
            include: {
              category: true,
            },
          },
          priceHistory: {
            orderBy: {
              capturedAt: "desc",
            },
            take: 8,
          },
        },
        orderBy: getOrderBy(sort),
        skip: offset,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        products: [],
        total: 0,
        hasMore: false,
        nextOffset: null,
      };
    }

    throw error;
  }

  const mappedProducts = products.map(mapProductCard);

  if (sort === "dayChange") {
    mappedProducts.sort((left, right) => Math.abs(left.dayOverDayPct ?? 0) - Math.abs(right.dayOverDayPct ?? 0));
  }

  if (sort === "weekChange") {
    mappedProducts.sort((left, right) => Math.abs(left.weekOverWeekPct ?? 0) - Math.abs(right.weekOverWeekPct ?? 0));
  }

  return {
    products: mappedProducts,
    total,
    hasMore: offset + mappedProducts.length < total,
    nextOffset: offset + mappedProducts.length < total ? offset + mappedProducts.length : null,
  };
}

export async function getRecommendedProducts(
  requestText: string,
  sort: RecommendationSortMode = "unitPrice",
): Promise<RecommendationResult> {
  const items = await parseShoppingRequest(requestText);

  if (!items.length) {
    return {
      items: [],
      groups: [],
      sort,
    };
  }

  const groups = await Promise.all(
    items.map(async (item) => {
      const searchTerms = Array.from(new Set([item.originalText, item.normalizedEn, item.normalizedEs].filter(Boolean)));
      const products = await prisma.product.findMany({
        where: {
          OR: searchTerms.flatMap((term) => [
            { originalName: { contains: term } },
            { genericNameEn: { contains: term } },
            { genericNameEs: { contains: term } },
          ]),
        },
        include: {
          categories: {
            include: {
              category: true,
            },
          },
          priceHistory: {
            orderBy: {
              capturedAt: "desc",
            },
            take: 8,
          },
        },
        take: 30,
      });

      const mapped = products.map(mapProductCard);
      mapped.sort((left, right) => {
        const scoreDiff = rankRecommendationMatch(right, item) - rankRecommendationMatch(left, item);

        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        if (sort === "price") {
          return left.currentPrice - right.currentPrice;
        }

        return (left.currentUnitPrice ?? Number.MAX_SAFE_INTEGER) - (right.currentUnitPrice ?? Number.MAX_SAFE_INTEGER);
      });

      return {
        request: item,
        options: mapped.slice(0, 4),
      };
    }),
  );

  return {
    items,
    groups,
    sort,
  };
}

export async function getFetchRuns(): Promise<FetchRunSummary[]> {
  let runs;

  try {
    runs = await prisma.fetchRun.findMany({
      orderBy: {
        startedAt: "desc",
      },
      take: 10,
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }

    throw error;
  }

  return runs.map((run) => ({
    id: run.id,
    status: run.status,
    sourceMode: run.sourceMode,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    itemsFetched: run.itemsFetched,
    itemsCreated: run.itemsCreated,
    itemsUpdated: run.itemsUpdated,
    itemsDiscovered: asFetchRunSummaryRow(run).itemsDiscovered,
    itemsExpected: asFetchRunSummaryRow(run).itemsExpected,
    pagesProcessed: asFetchRunSummaryRow(run).pagesProcessed,
    pagesExpected: asFetchRunSummaryRow(run).pagesExpected,
    categoriesDone: asFetchRunSummaryRow(run).categoriesDone,
    categoriesTotal: asFetchRunSummaryRow(run).categoriesTotal,
    currentStore: asFetchRunSummaryRow(run).currentStore,
    currentCategory: asFetchRunSummaryRow(run).currentCategory,
    currentMessage: asFetchRunSummaryRow(run).currentMessage,
    progressPercent: asFetchRunSummaryRow(run).progressPercent,
    warningCount: asFetchRunSummaryRow(run).warningCount,
    errorMessage: run.errorMessage,
    stores: mapStoreSummary(run),
  }));
}

export async function getLatestFetchRun(): Promise<FetchRunSummary | null> {
  let run;

  try {
    run = await prisma.fetchRun.findFirst({
      orderBy: {
        startedAt: "desc",
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }

    throw error;
  }

  if (!run) {
    return null;
  }

  return {
    id: run.id,
    status: run.status,
    sourceMode: run.sourceMode,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    itemsFetched: run.itemsFetched,
    itemsCreated: run.itemsCreated,
    itemsUpdated: run.itemsUpdated,
    itemsDiscovered: asFetchRunSummaryRow(run).itemsDiscovered,
    itemsExpected: asFetchRunSummaryRow(run).itemsExpected,
    pagesProcessed: asFetchRunSummaryRow(run).pagesProcessed,
    pagesExpected: asFetchRunSummaryRow(run).pagesExpected,
    categoriesDone: asFetchRunSummaryRow(run).categoriesDone,
    categoriesTotal: asFetchRunSummaryRow(run).categoriesTotal,
    currentStore: asFetchRunSummaryRow(run).currentStore,
    currentCategory: asFetchRunSummaryRow(run).currentCategory,
    currentMessage: asFetchRunSummaryRow(run).currentMessage,
    progressPercent: asFetchRunSummaryRow(run).progressPercent,
    warningCount: asFetchRunSummaryRow(run).warningCount,
    errorMessage: run.errorMessage,
    stores: mapStoreSummary(run),
  };
}

type FetchRunSummaryRow = {
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
  ahCategoriesDone: number;
  ahCategoriesTotal: number | null;
  ahPagesProcessed: number;
  ahPagesExpected: number | null;
  ahItemsFound: number;
  ahWarnings: number;
  ahCurrentCategory: string | null;
  ahCurrentMessage: string | null;
  ahCompletedAt: Date | null;
  jumboCategoriesDone: number;
  jumboCategoriesTotal: number | null;
  jumboPagesProcessed: number;
  jumboPagesExpected: number | null;
  jumboItemsFound: number;
  jumboWarnings: number;
  jumboCurrentCategory: string | null;
  jumboCurrentMessage: string | null;
  jumboCompletedAt: Date | null;
};

function asFetchRunSummaryRow(run: unknown) {
  return run as unknown as FetchRunSummaryRow;
}

function mapStoreSummary(run: unknown): { AH: FetchRunStoreSummary; JUMBO: FetchRunStoreSummary } {
  const row = asFetchRunSummaryRow(run);

  return {
    AH: {
      categoriesDone: row.ahCategoriesDone,
      categoriesTotal: row.ahCategoriesTotal,
      pagesProcessed: row.ahPagesProcessed,
      pagesExpected: row.ahPagesExpected,
      itemsFound: row.ahItemsFound,
      warnings: row.ahWarnings,
      currentCategory: row.ahCurrentCategory,
      currentMessage: row.ahCurrentMessage,
      completedAt: row.ahCompletedAt?.toISOString() ?? null,
    },
    JUMBO: {
      categoriesDone: row.jumboCategoriesDone,
      categoriesTotal: row.jumboCategoriesTotal,
      pagesProcessed: row.jumboPagesProcessed,
      pagesExpected: row.jumboPagesExpected,
      itemsFound: row.jumboItemsFound,
      warnings: row.jumboWarnings,
      currentCategory: row.jumboCurrentCategory,
      currentMessage: row.jumboCurrentMessage,
      completedAt: row.jumboCompletedAt?.toISOString() ?? null,
    },
  };
}
