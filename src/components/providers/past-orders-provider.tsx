"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CartItem, PastOrderPack } from "@/lib/types";

type PastOrdersContextValue = {
  packs: PastOrderPack[];
  addPack: (items: CartItem[], recipient?: string | null) => void;
  clearPacks: () => void;
};

const PastOrdersContext = createContext<PastOrdersContextValue | null>(null);

const storageKey = "shopping-assistant-past-orders";

function normalizeQuantity(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function normalizePack(pack: PastOrderPack): PastOrderPack {
  return {
    ...pack,
    items: pack.items.map((item) => ({
      ...item,
      quantity: normalizeQuantity(item.quantity),
    })),
  };
}

export function PastOrdersProvider({ children }: { children: ReactNode }) {
  const [packs, setPacks] = useState<PastOrderPack[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) {
      return;
    }

    try {
      setPacks((JSON.parse(saved) as PastOrderPack[]).map(normalizePack));
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(packs));
  }, [packs]);

  const value = useMemo(
    () => ({
      packs,
      addPack: (items: CartItem[], recipient?: string | null) => {
        if (!items.length) {
          return;
        }

        setPacks((current) => [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sentAt: new Date().toISOString(),
            recipient: recipient?.trim() || null,
            items,
          },
          ...current,
        ]);
      },
      clearPacks: () => setPacks([]),
    }),
    [packs],
  );

  return <PastOrdersContext.Provider value={value}>{children}</PastOrdersContext.Provider>;
}

export function usePastOrders() {
  const context = useContext(PastOrdersContext);

  if (!context) {
    throw new Error("usePastOrders must be used within PastOrdersProvider");
  }

  return context;
}
