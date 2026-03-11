"use client";

import Image from "next/image";
import { useMemo } from "react";
import { useLanguage } from "@/components/providers/language-provider";
import { useCart } from "@/components/providers/cart-provider";
import { formatCurrency } from "@/lib/utils";

export function CartView() {
  const { items, removeItem, clearCart } = useCart();
  const { language } = useLanguage();

  const groups = useMemo(() => {
    return items.reduce<Record<string, typeof items>>((accumulator, item) => {
      accumulator[item.supermarket] = [...(accumulator[item.supermarket] ?? []), item];
      return accumulator;
    }, {});
  }, [items]);

  const totals = useMemo(() => {
    return Object.entries(groups).map(([store, storeItems]) => ({
      store,
      subtotal: storeItems.reduce((sum, item) => sum + item.currentPrice, 0),
    }));
  }, [groups]);

  const total = totals.reduce((sum, entry) => sum + entry.subtotal, 0);

  if (!items.length) {
    return (
      <section className="text-center p-6 border border-gray-100 bg-white shadow-sm rounded-3xl">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mt-2 text-gray-900">Your cart is empty</h1>
        <p>Add products from the compare page to build your store plan.</p>
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6 items-start">
      <div className="flex flex-col gap-4 p-6 border border-gray-100 bg-white shadow-sm rounded-3xl">
        <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">Trip planner</p>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mt-2 text-gray-900">{Object.keys(groups).length} supermarkets to visit</h1>
        <p>Total basket: {formatCurrency(total)}</p>
        <div className="flex flex-col gap-3.5">
          {totals.map((entry) => (
            <div className="flex justify-between items-center p-4 rounded-xl bg-gray-50 border border-gray-100" key={entry.store}>
              <span>{entry.store}</span>
              <strong>{formatCurrency(entry.subtotal)}</strong>
            </div>
          ))}
        </div>
        <button className="inline-flex items-center justify-center px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors rounded-full" onClick={clearCart} type="button">
          Clear cart
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {Object.entries(groups).map(([store, storeItems]) => (
          <section className="flex flex-col gap-4 p-6 border border-gray-100 bg-white shadow-sm rounded-3xl" key={store}>
            <div className="flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center">
              <div>
                <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">{store}</p>
                <h2 className="text-xl sm:text-2xl font-bold leading-snug mt-1 text-gray-900">{storeItems.length} items</h2>
              </div>
              <strong>{formatCurrency(storeItems.reduce((sum, item) => sum + item.currentPrice, 0))}</strong>
            </div>

            <div className="flex flex-col gap-4">
              {storeItems.map((item) => (
                <article className="grid grid-cols-1 sm:grid-cols-[88px_1fr_auto] gap-4 items-center p-3.5 border border-gray-100 rounded-2xl bg-white/50" key={item.id}>
                  <div className="relative w-[88px] h-[88px] rounded-xl overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 flex-shrink-0">
                    {item.imageUrl ? (
                      <Image alt={item.originalName} fill sizes="88px" src={item.imageUrl.includes('images.ctfassets.net') ? `https://placehold.co/400x400/f8fafc/94a3b8.png?text=${encodeURIComponent(item.originalName)}` : item.imageUrl} />
                    ) : (
                      <div className="grid place-items-center h-full text-gray-400">No image</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="m-0 text-xs uppercase tracking-wide text-gray-500">{language === "es" ? item.genericNameEs : item.genericNameEn}</p>
                    <h3 className="text-lg font-semibold leading-snug mt-2 text-gray-900">{item.originalName}</h3>
                    <p>{item.quantityText}</p>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-2">
                    <strong>{formatCurrency(item.currentPrice)}</strong>
                    <button className="p-0 text-blue-600 bg-transparent hover:text-blue-700 transition-colors" onClick={() => removeItem(item.id)} type="button">
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
