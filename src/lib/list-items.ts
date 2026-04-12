import type { CartItem, FavouriteItem } from "@/lib/types";

function normalizeQuantity(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

export function normalizeCartItem(item: CartItem): CartItem {
  return {
    ...item,
    quantity: normalizeQuantity(item.quantity),
  };
}

export function normalizeFavouriteItem(item: FavouriteItem): FavouriteItem {
  return {
    ...item,
    quantity: normalizeQuantity(item.quantity),
  };
}
