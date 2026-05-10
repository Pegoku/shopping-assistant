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

export function mapProductCard(product: {
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

function tokenize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function tokenSimilarity(left: string, right: string) {
  if (left === right) {
    return 1;
  }

  if (left.length >= 3 && right.length >= 3 && (left.startsWith(right) || right.startsWith(left))) {
    return 0.9;
  }

  const distance = levenshteinDistance(left, right);
  const longest = Math.max(left.length, right.length);

  return longest ? 1 - distance / longest : 0;
}

function getProductSearchTokens(product: ProductCardData) {
  return tokenize(
    [
      product.supermarket,
      product.supermarket === "AH" ? "albert heijn" : "jumbo",
      product.originalName,
      product.genericNameEn,
      product.genericNameEs,
      product.quantityText,
      product.categories.join(" "),
    ].join(" "),
  );
}

function scoreFuzzyProductSearch(product: ProductCardData, search: string) {
  const queryTokens = tokenize(search);

  if (!queryTokens.length) {
    return 0;
  }

  const productTokens = getProductSearchTokens(product);
  let score = 0;

  for (const queryToken of queryTokens) {
    let best = 0;

    for (const productToken of productTokens) {
      best = Math.max(best, tokenSimilarity(queryToken, productToken));
    }

    if (best < 0.66) {
      return 0;
    }

    score += best;
  }

  const original = tokenize(product.originalName).join(" ");
  const genericEn = tokenize(product.genericNameEn).join(" ");
  const genericEs = tokenize(product.genericNameEs).join(" ");
  const normalizedSearch = queryTokens.join(" ");

  if (original.includes(normalizedSearch) || genericEn.includes(normalizedSearch) || genericEs.includes(normalizedSearch)) {
    score += 1.5;
  }

  if (product.isDealActive) {
    score += 0.05;
  }

  return score;
}

function buildFastSearchWhere(search: string) {
  const tokens = tokenize(search).filter((token) => token.length >= 2);
  const usefulTokens = tokens.filter((token) => !["jumbo", "jambo", "ah", "albert", "heijn"].includes(token));
  const terms = Array.from(new Set([search, ...usefulTokens])).slice(0, 8);

  if (!terms.length) {
    return {};
  }

  return {
    OR: terms.flatMap((term) => [
      { originalName: { contains: term } },
      { genericNameEn: { contains: term } },
      { genericNameEs: { contains: term } },
      { quantityText: { contains: term } },
      {
        categories: {
          some: {
            category: {
              label: { contains: term },
            },
          },
        },
      },
    ]),
  };
}

function hasWholeTokenMatch(text: string, candidate: string) {
  const tokens = tokenize(text);
  const candidateTokens = tokenize(candidate);

  if (!candidateTokens.length) {
    return false;
  }

  return candidateTokens.every((token) => tokens.includes(token));
}

function hasPrefixTokenMatch(text: string, candidate: string) {
  const tokens = tokenize(text);
  const candidateTokens = tokenize(candidate);

  if (!candidateTokens.length) {
    return false;
  }

  return candidateTokens.every((candidateToken) => tokens.some((token) => token.startsWith(candidateToken)));
}

function isStrongRecommendationCandidate(product: ProductCardData, request: RequestedItem) {
  const candidates = [request.originalText, request.normalizedEn, request.normalizedEs].filter(Boolean);
  const fields = [product.genericNameEn, product.genericNameEs, product.originalName];

  return candidates.some((candidate) => {
    const short = tokenize(candidate).join(" ").length <= 4;

    return fields.some((field) => {
      if (hasWholeTokenMatch(field, candidate)) {
        return true;
      }

      if (!short && hasPrefixTokenMatch(field, candidate)) {
        return true;
      }

      return false;
    });
  });
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
      score += 60;
    }
    if (hasWholeTokenMatch(genericEn, candidate) || hasWholeTokenMatch(genericEs, candidate)) {
      score += 35;
    }
    if (hasPrefixTokenMatch(genericEn, candidate) || hasPrefixTokenMatch(genericEs, candidate)) {
      score += 18;
    }
    if (hasWholeTokenMatch(original, candidate)) {
      score += 12;
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
    ...(search ? buildFastSearchWhere(search) : {}),
  };

  try {
    if (search) {
      products = await prisma.product.findMany({
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
        take: Math.max(250, limit * 4),
      });
      total = products.length;
    } else {
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
    }
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

  let mappedProducts = products.map(mapProductCard);

  if (search) {
    mappedProducts = mappedProducts
      .map((product) => ({
        product,
        score: scoreFuzzyProductSearch(product, search),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (sort === "price") {
          return left.product.currentPrice - right.product.currentPrice || right.score - left.score;
        }

        if (sort === "unitPrice") {
          return (left.product.currentUnitPrice ?? Number.MAX_SAFE_INTEGER) - (right.product.currentUnitPrice ?? Number.MAX_SAFE_INTEGER) || right.score - left.score;
        }

        return right.score - left.score || left.product.currentPrice - right.product.currentPrice;
      })
      .map((entry) => entry.product);
    total = mappedProducts.length;
  }

  if (sort === "dayChange") {
    mappedProducts.sort((left, right) => Math.abs(left.dayOverDayPct ?? 0) - Math.abs(right.dayOverDayPct ?? 0));
  }

  if (sort === "weekChange") {
    mappedProducts.sort((left, right) => Math.abs(left.weekOverWeekPct ?? 0) - Math.abs(right.weekOverWeekPct ?? 0));
  }

  const pageProducts = search ? mappedProducts.slice(offset, offset + limit) : mappedProducts;
  const nextOffset = offset + pageProducts.length;

  return {
    products: pageProducts,
    total,
    hasMore: nextOffset < total,
    nextOffset: nextOffset < total ? nextOffset : null,
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
      const filtered = mapped.filter((product) => isStrongRecommendationCandidate(product, item));
      const candidates = filtered.length ? filtered : mapped;
      candidates.sort((left, right) => {
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
        options: candidates.slice(0, 4),
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
