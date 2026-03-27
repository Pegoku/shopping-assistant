"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { FavouriteItem } from "@/lib/types";

type FavouritesContextValue = {
  items: FavouriteItem[];
  addItem: (item: FavouriteItem) => void;
  addItems: (items: FavouriteItem[]) => void;
  removeItem: (id: string) => void;
  toggleItem: (item: FavouriteItem) => void;
  clearFavourites: () => void;
  isFavourite: (id: string) => boolean;
};

const FavouritesContext = createContext<FavouritesContextValue | null>(null);

const storageKey = "shopping-assistant-favourites";

export function FavouritesProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FavouriteItem[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) {
      return;
    }

    try {
      setItems(JSON.parse(saved) as FavouriteItem[]);
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
      addItem: (item: FavouriteItem) => {
        setItems((current) => {
          if (current.some((entry) => entry.id === item.id)) {
            return current;
          }

          return [...current, item];
        });
      },
      addItems: (itemsToAdd: FavouriteItem[]) => {
        setItems((current) => {
          const existingIds = new Set(current.map((item) => item.id));
          const nextItems = itemsToAdd.filter((item) => !existingIds.has(item.id));

          if (!nextItems.length) {
            return current;
          }

          return [...current, ...nextItems];
        });
      },
      removeItem: (id: string) => {
        setItems((current) => current.filter((item) => item.id !== id));
      },
      toggleItem: (item: FavouriteItem) => {
        setItems((current) => {
          if (current.some((entry) => entry.id === item.id)) {
            return current.filter((entry) => entry.id !== item.id);
          }

          return [...current, item];
        });
      },
      clearFavourites: () => setItems([]),
      isFavourite: (id: string) => items.some((item) => item.id === id),
    }),
    [items],
  );

  return <FavouritesContext.Provider value={value}>{children}</FavouritesContext.Provider>;
}

export function useFavourites() {
  const context = useContext(FavouritesContext);

  if (!context) {
    throw new Error("useFavourites must be used within FavouritesProvider");
  }

  return context;
}
