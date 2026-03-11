"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { PriceSparkline } from "@/components/product/price-sparkline";
import { useLanguage } from "@/components/providers/language-provider";
import type { ProductCardData } from "@/lib/types";
import { formatCurrency, formatPercent, formatUnitLabel } from "@/lib/utils";

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
    <section className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-[2.2fr_1fr_1fr_auto] gap-3.5 items-end">
        <label className="flex flex-col gap-2">
          <span>Search</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="banana, yogur, bread..."
            type="search"
            value={search}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span>Sort by</span>
          <select onChange={(event) => setSortMode(event.target.value as SortMode)} value={sortMode}>
            <option value="relevance">Relevance</option>
            <option value="price">Price</option>
            <option value="unitPrice">Price / unit</option>
            <option value="dayChange">Day change</option>
            <option value="weekChange">Week change</option>
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span>Store</span>
          <select onChange={(event) => setSupermarket(event.target.value as "all" | "AH" | "JUMBO")} value={supermarket}>
            <option value="all">All supermarkets</option>
            <option value="AH">Albert Heijn</option>
            <option value="JUMBO">Jumbo</option>
          </select>
        </label>

        <label className="flex flex-row items-center gap-2 pb-4">
          <input checked={showDealsOnly} onChange={(event) => setShowDealsOnly(event.target.checked)} type="checkbox" />
          <span>Deals only</span>
        </label>
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-4 text-xs tracking-wide uppercase text-gray-500">
        <p>{filtered.length} products</p>
        <p>Search matches English, Spanish, and original store names.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3.5">
        {filtered.map((product) => {
          const displayName = product.genericNameEn;
          const secondaryName = language === "es" ? product.genericNameEs : product.genericNameEn;

          return (
            <article className="overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm flex flex-col" key={product.id}>
              <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                {product.imageUrl ? (
                  <Image alt={product.originalName} fill sizes="(max-width: 768px) 50vw, 220px" src={product.imageUrl.includes('images.ctfassets.net') ? `https://placehold.co/400x400/f8fafc/94a3b8.png?text=${encodeURIComponent(product.originalName)}` : product.imageUrl} />
                ) : (
                  <div className="grid place-items-center h-full text-xs text-gray-400">No image</div>
                )}
                <span className="absolute top-2 left-2 px-2 py-1 rounded-full bg-gray-900/80 text-white text-[10px] z-10">{product.supermarket}</span>
                {product.isDealActive ? <span className="absolute top-2 right-2 max-w-[55%] truncate px-2 py-1 rounded-full bg-red-600 text-white text-[10px] z-10">{product.dealText ?? "Deal"}</span> : null}
              </div>

              <div className="flex flex-col gap-3 p-3.5 flex-1">
                <div className="min-w-0">
                  <p className="m-0 text-[10px] tracking-wide text-gray-500 truncate">{product.originalName} · {secondaryName}</p>
                  <h3 className="text-sm font-semibold leading-snug mt-1 text-gray-900 line-clamp-2 capitalize">{displayName}</h3>
                  <p className="text-gray-500 text-xs truncate">{product.categories.join(" • ") || "Uncategorized"}</p>
                </div>

                <div className="flex flex-col gap-0.5">
                  <strong className="text-base">{formatCurrency(product.currentPrice)}</strong>
                  <span className="text-xs text-gray-600">
                    {product.currentUnitPrice
                      ? `${formatCurrency(product.currentUnitPrice)}/${formatUnitLabel(product.normalizedUnit)}`
                      : product.quantityText}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatCurrency(product.currentPrice)} · {product.quantityText}
                  </span>
                </div>

                <div className="flex flex-col gap-1 text-xs text-gray-500">
                  <span>DoD {formatPercent(product.dayOverDayPct)}</span>
                  <span>WoW {formatPercent(product.weekOverWeekPct)}</span>
                </div>

                <PriceSparkline values={product.priceHistory.map((entry) => entry.price)} />

                <div className="flex flex-col gap-2 mt-auto">
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
                    <a className="inline-flex items-center justify-center px-3 py-2 text-xs bg-gray-50 hover:bg-gray-100 transition-colors rounded-full" href={product.sourceUrl} rel="noreferrer" target="_blank">
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
