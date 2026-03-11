"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { PriceSparkline } from "@/components/product/price-sparkline";
import { useLanguage } from "@/components/providers/language-provider";
import type { ProductCardData } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils";

type ProductGridProps = {
  products: ProductCardData[];
};

type SortMode = "relevance" | "price" | "unitPrice" | "dayChange" | "weekChange";

export function ProductGrid({ products }: ProductGridProps) {
  const { language } = useLanguage();
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("relevance");
  const [showDealsOnly, setShowDealsOnly] = useState(false);
  const [supermarket, setSupermarket] = useState<"all" | "AH" | "JUMBO">("all");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = products.filter((product) => {
      const haystack = [
        product.originalName,
        product.genericNameEn,
        product.genericNameEs,
        product.categories.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      if (term && !haystack.includes(term)) {
        return false;
      }

      if (showDealsOnly && !product.isDealActive) {
        return false;
      }

      if (supermarket !== "all" && product.supermarket !== supermarket) {
        return false;
      }

      return true;
    });

    return [...list].sort((left, right) => {
      if (sortMode === "price") {
        return left.currentPrice - right.currentPrice;
      }

      if (sortMode === "unitPrice") {
        return (left.currentUnitPrice ?? Number.MAX_SAFE_INTEGER) - (right.currentUnitPrice ?? Number.MAX_SAFE_INTEGER);
      }

      if (sortMode === "dayChange") {
        return Math.abs(left.dayOverDayPct ?? 0) - Math.abs(right.dayOverDayPct ?? 0);
      }

      if (sortMode === "weekChange") {
        return Math.abs(left.weekOverWeekPct ?? 0) - Math.abs(right.weekOverWeekPct ?? 0);
      }

      return left.genericNameEn.localeCompare(right.genericNameEn) || left.currentPrice - right.currentPrice;
    });
  }, [products, search, showDealsOnly, sortMode, supermarket]);

  return (
    <section className="catalog-shell">
      <div className="toolbar">
        <label className="field search-field">
          <span>Search</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="banana, yogur, bread..."
            type="search"
            value={search}
          />
        </label>

        <label className="field">
          <span>Sort by</span>
          <select onChange={(event) => setSortMode(event.target.value as SortMode)} value={sortMode}>
            <option value="relevance">Relevance</option>
            <option value="price">Price</option>
            <option value="unitPrice">Price / unit</option>
            <option value="dayChange">Day change</option>
            <option value="weekChange">Week change</option>
          </select>
        </label>

        <label className="field">
          <span>Store</span>
          <select onChange={(event) => setSupermarket(event.target.value as "all" | "AH" | "JUMBO")} value={supermarket}>
            <option value="all">All supermarkets</option>
            <option value="AH">Albert Heijn</option>
            <option value="JUMBO">Jumbo</option>
          </select>
        </label>

        <label className="checkbox-field">
          <input checked={showDealsOnly} onChange={(event) => setShowDealsOnly(event.target.checked)} type="checkbox" />
          <span>Deals only</span>
        </label>
      </div>

      <div className="results-meta">
        <p>{filtered.length} products</p>
        <p>Search matches English, Spanish, and original store names.</p>
      </div>

      <div className="product-grid">
        {filtered.map((product) => {
          const displayName = language === "es" ? product.genericNameEs : product.genericNameEn;

          return (
            <article className="product-card" key={product.id}>
              <div className="product-card__media">
                {product.imageUrl ? (
                  <Image alt={product.originalName} fill sizes="(max-width: 768px) 100vw, 320px" src={product.imageUrl} />
                ) : (
                  <div className="image-fallback">No image</div>
                )}
                <span className="store-badge">{product.supermarket}</span>
                {product.isDealActive ? <span className="deal-badge">{product.dealText ?? "Deal"}</span> : null}
              </div>

              <div className="product-card__body">
                <div>
                  <p className="product-kicker">{displayName}</p>
                  <h3>{product.originalName}</h3>
                  <p className="product-meta">{product.categories.join(" • ") || "Uncategorized"}</p>
                </div>

                <div className="price-stack">
                  <strong>{formatCurrency(product.currentPrice)}</strong>
                  <span>
                    {product.currentUnitPrice ? `${formatCurrency(product.currentUnitPrice)} / ${product.quantityText}` : product.quantityText}
                  </span>
                </div>

                <div className="delta-row">
                  <span>DoD {formatPercent(product.dayOverDayPct)}</span>
                  <span>WoW {formatPercent(product.weekOverWeekPct)}</span>
                </div>

                <PriceSparkline values={product.priceHistory.map((entry) => entry.price)} />

                <div className="product-actions">
                  <AddToCartButton
                    item={{
                      id: product.id,
                      originalName: product.originalName,
                      genericNameEn: product.genericNameEn,
                      genericNameEs: product.genericNameEs,
                      supermarket: product.supermarket,
                      currentPrice: product.currentPrice,
                      quantityText: product.quantityText,
                      imageUrl: product.imageUrl,
                    }}
                  />
                  {product.sourceUrl ? (
                    <a className="ghost-button" href={product.sourceUrl} rel="noreferrer" target="_blank">
                      Source
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
