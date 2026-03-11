import { prisma } from "@/lib/db";
import type { FetchRunSummary, ProductCardData } from "@/lib/types";

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
  const products = await prisma.product.findMany({
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
  const runs = await prisma.fetchRun.findMany({
    orderBy: {
      startedAt: "desc",
    },
    take: 10,
  });

  return runs.map((run) => ({
    id: run.id,
    status: run.status,
    sourceMode: run.sourceMode,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    itemsFetched: run.itemsFetched,
    itemsCreated: run.itemsCreated,
    itemsUpdated: run.itemsUpdated,
    errorMessage: run.errorMessage,
  }));
}
