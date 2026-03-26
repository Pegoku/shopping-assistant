"use client";

import Image from "next/image";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { FavouriteButton } from "@/components/product/favourite-button";
import { useCart } from "@/components/providers/cart-provider";
import { useFavourites } from "@/components/providers/favourites-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { getShareableImageUrl } from "@/lib/cart-share";
import { formatCurrency } from "@/lib/utils";

export function FavouritesView() {
  const { addItems, items: cartItems } = useCart();
  const { clearFavourites, items } = useFavourites();
  const { language } = useLanguage();

  if (!items.length) {
    return (
      <section className="text-center p-6 border border-gray-100 bg-white shadow-sm rounded-3xl">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mt-2 text-gray-900">No favourites yet</h1>
        <p>Tap the heart on any product card or cart item to save it here for later.</p>
      </section>
    );
  }

  const cartIds = new Set(cartItems.map((item) => item.id));
  const itemsNotInCart = items.filter((item) => !cartIds.has(item.id));

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 p-6 border border-gray-100 bg-white shadow-sm rounded-3xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">Saved items</p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mt-2 text-gray-900">{items.length} favourites ready to reuse</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center justify-center px-4 py-3 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-full"
              disabled={!itemsNotInCart.length}
              onClick={() => addItems(itemsNotInCart)}
              type="button"
            >
              {itemsNotInCart.length ? `Add ${itemsNotInCart.length} to cart` : "All in cart"}
            </button>
            <button className="inline-flex items-center justify-center px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors rounded-full" onClick={clearFavourites} type="button">
              Clear favourites
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-500">Use the heart to remove saved items, or add them back to the cart whenever you need them.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3.5">
        {items.map((item) => {
          const inCart = cartIds.has(item.id);

          return (
            <article className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm flex flex-col" key={item.id}>
              <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
                {item.imageUrl ? (
                  <Image alt={item.originalName} fill sizes="(max-width: 768px) 50vw, 220px" src={getShareableImageUrl(item)} />
                ) : (
                  <div className="grid place-items-center h-full text-xs text-gray-400">No image</div>
                )}
                <span className="absolute top-2 left-2 px-2 py-1 rounded-full bg-gray-900/80 text-white text-[10px] z-10">{item.supermarket}</span>
                <FavouriteButton className="absolute bottom-2 right-2 z-10 h-10 w-10 shadow-sm" item={item} />
              </div>

              <div className="flex flex-col gap-3 p-3.5 flex-1">
                <div className="min-w-0">
                  <p className="m-0 text-[10px] tracking-wide text-gray-500 truncate">{item.originalName}</p>
                  <h2 className="text-sm font-semibold leading-snug mt-1 text-gray-900 line-clamp-2">{language === "es" ? item.genericNameEs : item.genericNameEn}</h2>
                  <p className="text-xs text-gray-500 truncate mt-1">{item.quantityText}</p>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <strong className="text-base text-gray-900">{formatCurrency(item.currentPrice)}</strong>
                  {inCart ? <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-full">In cart</span> : null}
                </div>

                <div className="mt-auto">
                  <AddToCartButton item={item} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
