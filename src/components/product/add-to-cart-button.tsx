"use client";

import { useCart } from "@/components/providers/cart-provider";
import type { CartItem } from "@/lib/types";

export function AddToCartButton({ item }: { item: CartItem }) {
  const { addItem, decrementItemQuantity, incrementItemQuantity, items } = useCart();
  const cartItem = items.find((entry) => entry.id === item.id);
  const quantity = cartItem?.quantity ?? 0;
  const isAdded = quantity > 0;

  if (!isAdded) {
    return (
      <button className="px-4 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors" onClick={() => addItem(item)} type="button">
        Add to cart
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        aria-label={`Decrease quantity for ${item.originalName}`}
        className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        onClick={() => decrementItemQuantity(item.id)}
        type="button"
      >
        -
      </button>
      <button className="min-w-0 flex-1 px-4 py-3 bg-blue-300 text-white rounded-full hover:bg-blue-400 transition-colors" onClick={() => incrementItemQuantity(item.id)} type="button">
        {`Added: ${quantity}`}
      </button>
      <button
        aria-label={`Increase quantity for ${item.originalName}`}
        className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        onClick={() => incrementItemQuantity(item.id)}
        type="button"
      >
        +
      </button>
    </div>
  );
}
