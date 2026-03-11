"use client";

import { useCart } from "@/components/providers/cart-provider";
import type { CartItem } from "@/lib/types";

export function AddToCartButton({ item }: { item: CartItem }) {
  const { addItem, items } = useCart();
  const isAdded = items.some((entry) => entry.id === item.id);

  return (
    <button className="px-4 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={isAdded} onClick={() => addItem(item)} type="button">
      {isAdded ? "Added" : "Add to cart"}
    </button>
  );
}
