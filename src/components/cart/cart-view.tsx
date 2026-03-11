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
      <section className="empty-state">
        <h1>Your cart is empty</h1>
        <p>Add products from the compare page to build your store plan.</p>
      </section>
    );
  }

  return (
    <section className="cart-layout">
      <div className="cart-summary-card">
        <p className="eyebrow">Trip planner</p>
        <h1>{Object.keys(groups).length} supermarkets to visit</h1>
        <p>Total basket: {formatCurrency(total)}</p>
        <div className="store-totals">
          {totals.map((entry) => (
            <div className="store-total" key={entry.store}>
              <span>{entry.store}</span>
              <strong>{formatCurrency(entry.subtotal)}</strong>
            </div>
          ))}
        </div>
        <button className="ghost-button" onClick={clearCart} type="button">
          Clear cart
        </button>
      </div>

      <div className="cart-groups">
        {Object.entries(groups).map(([store, storeItems]) => (
          <section className="cart-group" key={store}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{store}</p>
                <h2>{storeItems.length} items</h2>
              </div>
              <strong>{formatCurrency(storeItems.reduce((sum, item) => sum + item.currentPrice, 0))}</strong>
            </div>

            <div className="cart-items">
              {storeItems.map((item) => (
                <article className="cart-item" key={item.id}>
                  <div className="cart-item__media">
                    {item.imageUrl ? (
                      <Image alt={item.originalName} fill sizes="88px" src={item.imageUrl} />
                    ) : (
                      <div className="image-fallback">No image</div>
                    )}
                  </div>
                  <div className="cart-item__body">
                    <p className="product-kicker">{language === "es" ? item.genericNameEs : item.genericNameEn}</p>
                    <h3>{item.originalName}</h3>
                    <p>{item.quantityText}</p>
                  </div>
                  <div className="cart-item__actions">
                    <strong>{formatCurrency(item.currentPrice)}</strong>
                    <button className="link-button" onClick={() => removeItem(item.id)} type="button">
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
