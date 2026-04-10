"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CartItem } from "@/lib/types";

type CartContextValue = {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  addItems: (items: CartItem[]) => void;
  incrementItemQuantity: (id: string) => void;
  decrementItemQuantity: (id: string) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const storageKey = "shopping-assistant-cart";

function normalizeQuantity(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function normalizeCartItem(item: CartItem): CartItem {
  return {
    ...item,
    quantity: normalizeQuantity(item.quantity),
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) {
      return;
    }

    try {
      setItems((JSON.parse(saved) as CartItem[]).map(normalizeCartItem));
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items]);

  const value = useMemo(
    () => ({
      items,
      addItem: (item: CartItem) => {
        setItems((current) => {
          const existingItem = current.find((entry) => entry.id === item.id);

          if (existingItem) {
            return current.map((entry) => (entry.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry));
          }

          return [...current, normalizeCartItem(item)];
        });
      },
      addItems: (itemsToAdd: CartItem[]) => {
        setItems((current) => {
          const existingIds = new Set(current.map((item) => item.id));
          const nextItems = itemsToAdd.filter((item) => !existingIds.has(item.id)).map(normalizeCartItem);

          if (!nextItems.length) {
            return current;
          }

          return [...current, ...nextItems];
        });
      },
      incrementItemQuantity: (id: string) => {
        setItems((current) => current.map((item) => (item.id === id ? { ...item, quantity: item.quantity + 1 } : item)));
      },
      decrementItemQuantity: (id: string) => {
        setItems((current) =>
          current.flatMap((item) => {
            if (item.id !== id) {
              return [item];
            }

            if (item.quantity <= 1) {
              return [];
            }

            return [{ ...item, quantity: item.quantity - 1 }];
          }),
        );
      },
      removeItem: (id: string) => {
        setItems((current) => current.filter((item) => item.id !== id));
      },
      clearCart: () => setItems([]),
    }),
    [items],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }

  return context;
}
