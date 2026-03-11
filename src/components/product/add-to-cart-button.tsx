"use client";

import { useCart } from "@/components/providers/cart-provider";
import type { CartItem } from "@/lib/types";

export function AddToCartButton({ item }: { item: CartItem }) {
  const { addItem, items } = useCart();
  const isAdded = items.some((entry) => entry.id === item.id);

  return (
    <button className="action-button" disabled={isAdded} onClick={() => addItem(item)} type="button">
      {isAdded ? "Added" : "Add to cart"}
    </button>
  );
}
