import { Supermarket } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeReceiptAlias } from "@/lib/past-orders";
import { mapProductCard } from "@/lib/queries";

function levenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1, previous[rightIndex - 1] + cost);
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function scoreAlias(search: string, normalized: string) {
  if (search === normalized) {
    return 100;
  }

  if (normalized.includes(search) || search.includes(normalized)) {
    return 80;
  }

  const searchTokens = search.split(" ").filter(Boolean);
  const aliasTokens = normalized.split(" ").filter(Boolean);
  const tokenScore = searchTokens.reduce((sum, token) => {
    const best = aliasTokens.reduce((bestScore, aliasToken) => {
      const longest = Math.max(token.length, aliasToken.length);
      const similarity = longest ? 1 - levenshteinDistance(token, aliasToken) / longest : 0;
      return Math.max(bestScore, similarity);
    }, 0);

    return sum + best;
  }, 0) / Math.max(searchTokens.length, 1);

  return tokenScore >= 0.62 ? tokenScore * 70 : 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const supermarket = searchParams.get("supermarket");
  const search = normalizeReceiptAlias(searchParams.get("search") ?? "");

  if ((supermarket !== "AH" && supermarket !== "JUMBO") || !search) {
    return NextResponse.json({ aliases: [] });
  }

  const aliases = await prisma.receiptProductAlias.findMany({
    where: { supermarket: supermarket as Supermarket },
    include: {
      product: {
        include: {
          categories: { include: { category: true } },
          priceHistory: { orderBy: { capturedAt: "desc" }, take: 8 },
        },
      },
    },
    take: 500,
  });

  const scoredAliases = aliases
    .map((alias) => ({ alias, score: scoreAlias(search, alias.normalized) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map((entry) => ({
      id: entry.alias.id,
      alias: entry.alias.alias,
      normalized: entry.alias.normalized,
      exact: entry.alias.normalized === search,
      product: mapProductCard(entry.alias.product),
    }));

  return NextResponse.json({ aliases: scoredAliases });
}
