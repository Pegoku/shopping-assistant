import { prisma } from "@/lib/db";
import type { FetchRunStoreSummary, FetchRunSummary, ProductCardData } from "@/lib/types";

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

export async function getProducts(): Promise<ProductCardData[]> {
  let products;

  try {
    products = await prisma.product.findMany({
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
        },
      },
      orderBy: [{ genericNameEn: "asc" }, { supermarket: "asc" }],
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }

    throw error;
  }

  return products.map((product) => {
    const dayPrice = nearestHistoryPrice(product.priceHistory, 1);
    const weekPrice = nearestHistoryPrice(product.priceHistory, 7);

    return {
      id: product.id,
      supermarket: product.supermarket,
      originalName: product.originalName,
      genericNameEn: product.genericNameEn,
      genericNameEs: product.genericNameEs,
      quantityText: product.quantityText,
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
  });
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
  jumboCategoriesDone: number;
  jumboCategoriesTotal: number | null;
  jumboPagesProcessed: number;
  jumboPagesExpected: number | null;
  jumboItemsFound: number;
  jumboWarnings: number;
  jumboCurrentCategory: string | null;
  jumboCurrentMessage: string | null;
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
    },
  };
}
