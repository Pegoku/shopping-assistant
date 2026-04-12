"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CartItem } from "@/lib/types";
import { normalizeCartItem } from "@/lib/list-items";

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

function readLocalItems() {
  const saved = window.localStorage.getItem(storageKey);

  if (!saved) {
    return [] as CartItem[];
  }

  try {
    return (JSON.parse(saved) as CartItem[]).map(normalizeCartItem);
  } catch {
    window.localStorage.removeItem(storageKey);
    return [] as CartItem[];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function persistItems(nextItems: CartItem[]) {
      const response = await fetch("/api/cart", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: nextItems.map(normalizeCartItem) }),
      });

      if (!response.ok) {
        throw new Error("Failed to save shared cart.");
      }
    }

    async function loadItems() {
      const localItems = readLocalItems();

      try {
        const response = await fetch("/api/cart", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Failed to load shared cart.");
        }

        const data = (await response.json()) as { items: CartItem[] };
        const remoteItems = data.items.map(normalizeCartItem);
        const nextItems = remoteItems.length ? remoteItems : localItems;

        if (!isMounted) {
          return;
        }

        setItems(nextItems);
        window.localStorage.setItem(storageKey, JSON.stringify(nextItems));

        if (!remoteItems.length && localItems.length) {
          await persistItems(localItems);
        }
      } catch {
        if (!isMounted) {
          return;
        }

        setItems(localItems);
      }
    }

    void loadItems();

    const interval = window.setInterval(() => {
      void loadItems();
    }, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  function updateItems(updater: (current: CartItem[]) => CartItem[]) {
    let nextItems: CartItem[] = [];

    setItems((current) => {
      nextItems = updater(current).map(normalizeCartItem);
      window.localStorage.setItem(storageKey, JSON.stringify(nextItems));
      return nextItems;
    });

    void fetch("/api/cart", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: nextItems }),
    }).catch(() => {
      // Keep the UI responsive; a future poll will retry server sync.
    });
  }

  const value = useMemo(
    () => ({
      items,
      addItem: (item: CartItem) => {
        updateItems((current) => {
          const existingItem = current.find((entry) => entry.id === item.id);

          if (existingItem) {
            return current.map((entry) => (entry.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry));
          }

          return [...current, normalizeCartItem(item)];
        });
      },
      addItems: (itemsToAdd: CartItem[]) => {
        updateItems((current) => {
          const existingIds = new Set(current.map((item) => item.id));
          const nextItems = itemsToAdd.filter((item) => !existingIds.has(item.id)).map(normalizeCartItem);

          if (!nextItems.length) {
            return current;
          }

          return [...current, ...nextItems];
        });
      },
      incrementItemQuantity: (id: string) => {
        updateItems((current) => current.map((item) => (item.id === id ? { ...item, quantity: item.quantity + 1 } : item)));
      },
      decrementItemQuantity: (id: string) => {
        updateItems((current) =>
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
        updateItems((current) => current.filter((item) => item.id !== id));
      },
      clearCart: () => updateItems(() => []),
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
