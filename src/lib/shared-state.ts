import { Supermarket } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeCartItem, normalizeFavouriteItem } from "@/lib/list-items";
import type { CartItem, FavouriteItem } from "@/lib/types";

export { normalizeCartItem, normalizeFavouriteItem } from "@/lib/list-items";

export async function getSharedCartItems() {
  const rows = await prisma.sharedCartItem.findMany({
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "asc" }],
  });

  return rows.map((row) => normalizeCartItem(row));
}

export async function saveSharedCartItems(items: CartItem[]) {
  const normalizedItems = items.map(normalizeCartItem);

  await prisma.$transaction(async (tx) => {
    await tx.sharedCartItem.deleteMany({
      where: {
        id: {
          notIn: normalizedItems.map((item) => item.id),
        },
      },
    });

    for (const [sortOrder, item] of normalizedItems.entries()) {
      await tx.sharedCartItem.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          originalName: item.originalName,
          genericNameEn: item.genericNameEn,
          genericNameEs: item.genericNameEs,
          supermarket: item.supermarket as Supermarket,
          currentPrice: item.currentPrice,
          quantityText: item.quantityText,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          sortOrder,
        },
        update: {
          originalName: item.originalName,
          genericNameEn: item.genericNameEn,
          genericNameEs: item.genericNameEs,
          supermarket: item.supermarket as Supermarket,
          currentPrice: item.currentPrice,
          quantityText: item.quantityText,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          sortOrder,
        },
      });
    }
  });

  return normalizedItems;
}

export async function getSharedFavouriteItems() {
  const rows = await prisma.sharedFavouriteItem.findMany({
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "asc" }],
  });

  return rows.map((row) => normalizeFavouriteItem(row));
}

export async function saveSharedFavouriteItems(items: FavouriteItem[]) {
  const normalizedItems = items.map(normalizeFavouriteItem);

  await prisma.$transaction(async (tx) => {
    await tx.sharedFavouriteItem.deleteMany({
      where: {
        id: {
          notIn: normalizedItems.map((item) => item.id),
        },
      },
    });

    for (const [sortOrder, item] of normalizedItems.entries()) {
      await tx.sharedFavouriteItem.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          originalName: item.originalName,
          genericNameEn: item.genericNameEn,
          genericNameEs: item.genericNameEs,
          supermarket: item.supermarket as Supermarket,
          currentPrice: item.currentPrice,
          quantityText: item.quantityText,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          sortOrder,
        },
        update: {
          originalName: item.originalName,
          genericNameEn: item.genericNameEn,
          genericNameEs: item.genericNameEs,
          supermarket: item.supermarket as Supermarket,
          currentPrice: item.currentPrice,
          quantityText: item.quantityText,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          sortOrder,
        },
      });
    }
  });

  return normalizedItems;
}
