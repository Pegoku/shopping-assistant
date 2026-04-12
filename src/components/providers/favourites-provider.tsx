"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { FavouriteItem } from "@/lib/types";
import { normalizeFavouriteItem } from "@/lib/list-items";

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

function readLocalItems() {
  const saved = window.localStorage.getItem(storageKey);

  if (!saved) {
    return [] as FavouriteItem[];
  }

  try {
    return (JSON.parse(saved) as FavouriteItem[]).map(normalizeFavouriteItem);
  } catch {
    window.localStorage.removeItem(storageKey);
    return [] as FavouriteItem[];
  }
}

export function FavouritesProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FavouriteItem[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function persistItems(nextItems: FavouriteItem[]) {
      const response = await fetch("/api/favourites", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: nextItems.map(normalizeFavouriteItem) }),
      });

      if (!response.ok) {
        throw new Error("Failed to save shared favourites.");
      }
    }

    async function loadItems() {
      const localItems = readLocalItems();

      try {
        const response = await fetch("/api/favourites", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Failed to load shared favourites.");
        }

        const data = (await response.json()) as { items: FavouriteItem[] };
        const remoteItems = data.items.map(normalizeFavouriteItem);
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

  function updateItems(updater: (current: FavouriteItem[]) => FavouriteItem[]) {
    let nextItems: FavouriteItem[] = [];

    setItems((current) => {
      nextItems = updater(current).map(normalizeFavouriteItem);
      window.localStorage.setItem(storageKey, JSON.stringify(nextItems));
      return nextItems;
    });

    void fetch("/api/favourites", {
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
      addItem: (item: FavouriteItem) => {
        updateItems((current) => {
          if (current.some((entry) => entry.id === item.id)) {
            return current;
          }

          return [...current, normalizeFavouriteItem(item)];
        });
      },
      addItems: (itemsToAdd: FavouriteItem[]) => {
        updateItems((current) => {
          const existingIds = new Set(current.map((item) => item.id));
          const nextItems = itemsToAdd.filter((item) => !existingIds.has(item.id)).map(normalizeFavouriteItem);

          if (!nextItems.length) {
            return current;
          }

          return [...current, ...nextItems];
        });
      },
      removeItem: (id: string) => {
        updateItems((current) => current.filter((item) => item.id !== id));
      },
      toggleItem: (item: FavouriteItem) => {
        updateItems((current) => {
          if (current.some((entry) => entry.id === item.id)) {
            return current.filter((entry) => entry.id !== item.id);
          }

          return [...current, normalizeFavouriteItem(item)];
        });
      },
      clearFavourites: () => updateItems(() => []),
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
