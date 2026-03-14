"use client";

import Image from "next/image";
import { useState } from "react";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { useLanguage } from "@/components/providers/language-provider";
import type { ProductCardData, RecommendationResult, RecommendationSortMode } from "@/lib/types";
import { formatCurrency, formatUnitLabel } from "@/lib/utils";

export function RecommendationBuilder() {
  const { language } = useLanguage();
  const [text, setText] = useState("lechuga, tomate frito, sal, agua");
  const [sort, setSort] = useState<RecommendationSortMode>("unitPrice");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecommendationResult | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, sort }),
      });

      const payload = (await response.json()) as RecommendationResult;
      setResult(payload);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-7 shadow-sm">
      <div className="flex flex-col gap-2">
        <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">Natural basket</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Write your shopping list naturally and get the best matching options.</h2>
        <p className="text-sm text-gray-500">Use English or Spanish. Example: `lechuga, tomate frito, sal, agua`.</p>
      </div>

      <form className="mt-5 flex flex-col gap-4" onSubmit={onSubmit}>
        <textarea
          className="min-h-28 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none"
          onChange={(event) => setText(event.target.value)}
          placeholder="Quiero lechuga, tomate frito, sal y agua"
          value={text}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span>Rank by</span>
            <select
              className="rounded-full border border-gray-200 bg-white px-3 py-2"
              onChange={(event) => setSort(event.target.value as RecommendationSortMode)}
              value={sort}
            >
              <option value="unitPrice">EUR / unit</option>
              <option value="price">Total price</option>
            </select>
          </label>

          <button className="rounded-full bg-gray-900 px-5 py-3 text-sm text-white hover:bg-gray-800 disabled:opacity-50" disabled={loading} type="submit">
            {loading ? "Looking for best matches..." : "Find best matches"}
          </button>
        </div>
      </form>

      {result ? (
        <div className="mt-6 flex flex-col gap-6">
          {result.groups.map((group) => (
            <section className="flex flex-col gap-3" key={`${group.request.originalText}-${group.request.normalizedEn}`}>
              <div>
                <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">Requested item</p>
                <h3 className="text-lg font-semibold text-gray-900 capitalize">{language === "es" ? group.request.normalizedEs : group.request.normalizedEn}</h3>
                <p className="text-sm text-gray-500">Original input: {group.request.originalText}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
                {group.options.length ? (
                  group.options.map((option) => <RecommendationCard key={option.id} language={language} product={option} />)
                ) : (
                  <p className="text-sm text-gray-500">No matching products found for this item yet.</p>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RecommendationCard({ language, product }: { language: "en" | "es"; product: ProductCardData }) {
  const displayName = language === "es" ? product.genericNameEs : product.genericNameEn;

  return (
    <article className="overflow-hidden rounded-2xl bg-gray-50 border border-gray-100 shadow-sm flex flex-col">
      <div className="relative aspect-square overflow-hidden bg-white flex items-center justify-center">
        {product.imageUrl ? (
          <Image alt={product.originalName} fill sizes="240px" src={product.imageUrl} />
        ) : (
          <div className="grid place-items-center h-full text-xs text-gray-400">No image</div>
        )}
        <span className="absolute top-2 left-2 px-2 py-1 rounded-full bg-gray-900/80 text-white text-[10px] z-10">{product.supermarket}</span>
      </div>

      <div className="flex flex-col gap-3 p-3.5 flex-1">
        <div className="min-w-0">
          <p className="m-0 text-[10px] tracking-wide text-gray-500 truncate">{product.originalName}</p>
          <h3 className="text-sm font-semibold leading-snug mt-1 text-gray-900 line-clamp-2 capitalize">{displayName}</h3>
        </div>

        <div className="flex flex-col gap-0.5">
          <strong className="text-base">{formatCurrency(product.currentPrice)} · {product.quantityText}</strong>
          <span className="text-xs text-gray-600">
            {product.currentUnitPrice ? `${formatCurrency(product.currentUnitPrice)}/${formatUnitLabel(product.normalizedUnit)}` : product.quantityText}
          </span>
        </div>

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
      </div>
    </article>
  );
}
