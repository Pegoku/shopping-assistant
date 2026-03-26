"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { FavouriteButton } from "@/components/product/favourite-button";
import { PriceSparkline } from "@/components/product/price-sparkline";
import { useLanguage } from "@/components/providers/language-provider";
import { getShareableImageUrl } from "@/lib/cart-share";
import { toCartItem, toFavouriteItem } from "@/lib/product-items";
import type { ProductCardData, ProductQueryResult, ProductSortMode } from "@/lib/types";
import { formatCurrency, formatPercent, formatUnitLabel } from "@/lib/utils";

type ProductGridProps = {
  initialResult: ProductQueryResult;
};

const pageSize = 120;
const preloadThreshold = 60;

export function ProductGrid({ initialResult }: ProductGridProps) {
  const { language } = useLanguage();
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<ProductSortMode>("relevance");
  const [showDealsOnly, setShowDealsOnly] = useState(false);
  const [supermarket, setSupermarket] = useState<"all" | "AH" | "JUMBO">("all");
  const [result, setResult] = useState<ProductQueryResult>(initialResult);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, ProductCardData>>({});
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const selectedCompareProducts = useMemo(
    () => Object.values(selectedProducts).sort((left, right) => (left.currentUnitPrice ?? Number.MAX_SAFE_INTEGER) - (right.currentUnitPrice ?? Number.MAX_SAFE_INTEGER)),
    [selectedProducts],
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      sort: sortMode,
      supermarket,
      dealsOnly: String(showDealsOnly),
    });

    if (search.trim()) {
      params.set("search", search.trim());
    }

    return params;
  }, [search, showDealsOnly, sortMode, supermarket]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);

      try {
        const response = await fetch(`/api/products?${queryString.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as ProductQueryResult;
        setResult(payload);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error(error);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [queryString]);

  const loadMore = useCallback(async () => {
    if (!result.hasMore || loadingMore || result.nextOffset === null) {
      return;
    }

    setLoadingMore(true);

    try {
      const params = new URLSearchParams(queryString);
      params.set("offset", String(result.nextOffset));
      const response = await fetch(`/api/products?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as ProductQueryResult;
      setResult((current) => ({
        ...payload,
        products: [...current.products, ...payload.products],
      }));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, queryString, result.hasMore, result.nextOffset]);

  useEffect(() => {
    const target = loadMoreRef.current;

    if (!target || !result.hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (entry?.isIntersecting && !loadingMore && !loading) {
          void loadMore();
        }
      },
      { rootMargin: "200px 0px" },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [loadMore, loading, loadingMore, result.hasMore, result.nextOffset]);

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
          <select onChange={(event) => setSortMode(event.target.value as ProductSortMode)} value={sortMode}>
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3">
        <div className="text-sm text-gray-600">
          <strong className="text-gray-900">{selectedCompareProducts.length}</strong> items selected for comparison
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedCompareProducts.length ? (
            <button
              className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
              onClick={() => {
                setSelectedProducts({});
                setCompareMode(false);
              }}
              type="button"
            >
              Clear selection
            </button>
          ) : null}
          <button
            className="rounded-full bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
            disabled={selectedCompareProducts.length < 2}
            onClick={() => setCompareMode((current) => !current)}
            type="button"
          >
            {compareMode ? "Exit compare" : `Compare ${selectedCompareProducts.length || ""}`.trim()}
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-4 text-xs tracking-wide uppercase text-gray-500">
        <p>{loading ? "Loading..." : `${result.total} products`}</p>
        <p>Showing {result.products.length} loaded so far. Search and filters run server-side.</p>
      </div>

      {compareMode ? <ComparePanel language={language} products={selectedCompareProducts} /> : null}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3.5">
        {result.products.map((product, index) => {
          const shouldAttachSentinel = result.hasMore && index === Math.max(0, result.products.length - preloadThreshold);

          return (
            <div key={product.id} ref={shouldAttachSentinel ? loadMoreRef : null}>
              <ProductCard
                isSelectedForCompare={Boolean(selectedProducts[product.id])}
                language={language}
                onToggleCompare={() => {
                  setSelectedProducts((current) => {
                    if (current[product.id]) {
                      const next = { ...current };
                      delete next[product.id];
                      return next;
                    }

                    return {
                      ...current,
                      [product.id]: product,
                    };
                  });
                }}
                product={product}
              />
            </div>
          );
        })}
      </div>

      {result.hasMore ? (
        <div className="flex justify-center pt-2">
          <button
            className="px-5 py-3 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            type="button"
          >
            {loadingMore ? "Loading more..." : `Load ${pageSize} more`}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ProductCard({
  language,
  onToggleCompare,
  isSelectedForCompare,
  product,
}: {
  language: "en" | "es";
  onToggleCompare: () => void;
  isSelectedForCompare: boolean;
  product: ProductCardData;
}) {
  const displayName = language === "es" ? product.genericNameEs : product.genericNameEn;

  return (
    <article className={`overflow-hidden rounded-2xl bg-white border shadow-sm flex flex-col ${isSelectedForCompare ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-100"}`}>
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        {product.imageUrl ? (
          <Image
            alt={product.originalName}
            fill
            sizes="(max-width: 768px) 50vw, 220px"
            src={getShareableImageUrl(product)}
          />
        ) : (
          <div className="grid place-items-center h-full text-xs text-gray-400">No image</div>
        )}
        <span className="absolute top-2 left-2 px-2 py-1 rounded-full bg-gray-900/80 text-white text-[10px] z-10">{product.supermarket}</span>
        <FavouriteButton className="absolute bottom-2 right-2 z-10 h-10 w-10 shadow-sm" item={toFavouriteItem(product)} />
        {product.isDealActive ? <span className="absolute top-2 right-2 max-w-[55%] truncate px-2 py-1 rounded-full bg-red-600 text-white text-[10px] z-10">{product.dealText ?? "Deal"}</span> : null}
      </div>

      <div className="flex flex-col gap-3 p-3.5 flex-1">
        <div className="min-w-0">
          <p className="m-0 text-[10px] tracking-wide text-gray-500 truncate">{product.originalName}</p>
          <h3 className="text-sm font-semibold leading-snug mt-1 text-gray-900 line-clamp-2 capitalize">{displayName}</h3>
          <p className="text-gray-500 text-xs truncate">{product.categories.join(" • ") || "Uncategorized"}</p>
        </div>

        <div className="flex flex-col gap-0.5">
          <strong className="text-base">{formatCurrency(product.currentPrice)} · {product.quantityText}</strong>
          <span className="text-xs text-gray-600">
            {product.currentUnitPrice ? `${formatCurrency(product.currentUnitPrice)}/${formatUnitLabel(product.normalizedUnit)}` : product.quantityText}
          </span>
        </div>

        <div className="flex flex-col gap-1 text-xs text-gray-500">
          <span>DoD {formatPercent(product.dayOverDayPct)}</span>
          <span>WoW {formatPercent(product.weekOverWeekPct)}</span>
        </div>

        <PriceSparkline values={product.priceHistory.map((entry) => entry.price)} />

        <div className="flex flex-col gap-2 mt-auto">
          <button
            className={`inline-flex items-center justify-center px-3 py-2 text-xs rounded-full transition-colors ${isSelectedForCompare ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
            onClick={onToggleCompare}
            type="button"
          >
            {isSelectedForCompare ? "Selected for compare" : "Select to compare"}
          </button>
          <AddToCartButton
            item={toCartItem(product)}
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
}

function ComparePanel({ language, products }: { language: "en" | "es"; products: ProductCardData[] }) {
  if (products.length < 2) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5">
      <div className="mb-4">
        <p className="text-xs tracking-wide uppercase text-blue-700 font-medium">Comparison mode</p>
        <h3 className="text-xl font-semibold text-gray-900">Compare selected products side by side.</h3>
      </div>

      <div className="overflow-x-auto">
        <div className="grid gap-4" style={{ gridTemplateColumns: `220px repeat(${products.length}, minmax(220px, 1fr))` }}>
          <div className="font-medium text-sm text-gray-500">Metric</div>
          {products.map((product) => (
            <div className="rounded-2xl border border-white/80 bg-white p-3 shadow-sm" key={product.id}>
              <p className="text-[10px] tracking-wide text-gray-500 truncate">{product.originalName}</p>
              <h4 className="mt-1 text-sm font-semibold text-gray-900 capitalize line-clamp-2">{language === "es" ? product.genericNameEs : product.genericNameEn}</h4>
              <p className="mt-2 text-xs text-gray-500">{product.supermarket}</p>
            </div>
          ))}

          <CompareRow label="Total price" products={products} renderValue={(product) => formatCurrency(product.currentPrice)} />
          <CompareRow label="Unit price" products={products} renderValue={(product) => (product.currentUnitPrice ? `${formatCurrency(product.currentUnitPrice)}/${formatUnitLabel(product.normalizedUnit)}` : "-" )} />
          <CompareRow label="Quantity" products={products} renderValue={(product) => product.quantityText} />
          <CompareRow label="Deals" products={products} renderValue={(product) => product.dealText ?? (product.isDealActive ? "Deal" : "No") } />
          <CompareRow label="DoD" products={products} renderValue={(product) => formatPercent(product.dayOverDayPct)} />
          <CompareRow label="WoW" products={products} renderValue={(product) => formatPercent(product.weekOverWeekPct)} />
          <CompareRow label="Categories" products={products} renderValue={(product) => product.categories.join(" • ") || "-"} />
        </div>
      </div>
    </section>
  );
}

function CompareRow({
  label,
  products,
  renderValue,
}: {
  label: string;
  products: ProductCardData[];
  renderValue: (product: ProductCardData) => string;
}) {
  return (
    <>
      <div className="py-3 text-sm font-medium text-gray-600">{label}</div>
      {products.map((product) => (
        <div className="rounded-2xl border border-white/70 bg-white px-3 py-3 text-sm text-gray-900" key={`${product.id}-${label}`}>
          {renderValue(product)}
        </div>
      ))}
    </>
  );
}
