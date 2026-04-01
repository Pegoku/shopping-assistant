"use client";

import Image from "next/image";
import { useMemo } from "react";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { FavouriteButton } from "@/components/product/favourite-button";
import { useCart } from "@/components/providers/cart-provider";
import { useFavourites } from "@/components/providers/favourites-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { usePastOrders } from "@/components/providers/past-orders-provider";
import { getShareableImageUrl } from "@/lib/cart-share";
import { formatCurrency } from "@/lib/utils";

function formatPackDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function PastOrdersView() {
  const { addItems, items: cartItems } = useCart();
  const { addItems: addFavouriteItems, items: favouriteItems } = useFavourites();
  const { language } = useLanguage();
  const { clearPacks, packs } = usePastOrders();

  const cartIds = useMemo(() => new Set(cartItems.map((item) => item.id)), [cartItems]);
  const favouriteIds = useMemo(() => new Set(favouriteItems.map((item) => item.id)), [favouriteItems]);

  if (!packs.length) {
    return (
      <section className="text-center p-6 border border-gray-100 bg-white shadow-sm rounded-3xl">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mt-2 text-gray-900">No past orders yet</h1>
        <p>Every time you send the cart to WhatsApp, that pack will appear here with its send date and items.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 p-6 border border-gray-100 bg-white shadow-sm rounded-3xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">Past WhatsApp packs</p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mt-2 text-gray-900">{packs.length} sent packs ready to reuse</h1>
          </div>
          <button className="inline-flex items-center justify-center px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors rounded-full" onClick={clearPacks} type="button">
            Clear history
          </button>
        </div>
        <p className="text-sm text-gray-500">Open any pack to quickly add old items back to favourites or your cart.</p>
      </div>

      <div className="flex flex-col gap-4">
        {packs.map((pack) => {
          const packTotal = pack.items.reduce((sum, item) => sum + item.currentPrice * item.quantity, 0);
          const packUnits = pack.items.reduce((sum, item) => sum + item.quantity, 0);
          const itemsNotInCart = pack.items.filter((item) => !cartIds.has(item.id));
          const itemsNotInFavourites = pack.items.filter((item) => !favouriteIds.has(item.id));

          return (
            <section className="flex flex-col gap-4 p-6 border border-gray-100 bg-white shadow-sm rounded-3xl" key={pack.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">Pack sent {formatPackDate(pack.sentAt)}</p>
                  <h2 className="text-2xl sm:text-3xl font-bold leading-snug mt-2 text-gray-900">{packUnits} units across {pack.items.length} products</h2>
                  <p className="text-sm text-gray-500 mt-1">{pack.recipient ? `Sent to ${pack.recipient}` : "Sent without a saved recipient"}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="inline-flex items-center justify-center px-4 py-3 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-full"
                    disabled={!itemsNotInCart.length}
                    onClick={() => addItems(itemsNotInCart)}
                    type="button"
                  >
                    {itemsNotInCart.length ? `Add pack to cart (${itemsNotInCart.length})` : "Pack already in cart"}
                  </button>
                  <button
                    className="inline-flex items-center justify-center px-4 py-3 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-full"
                    disabled={!itemsNotInFavourites.length}
                    onClick={() => addFavouriteItems(itemsNotInFavourites)}
                    type="button"
                  >
                    {itemsNotInFavourites.length ? `Add pack to favourites (${itemsNotInFavourites.length})` : "Pack already saved"}
                  </button>
                  <div className="inline-flex items-center justify-center px-4 py-3 bg-gray-50 rounded-full text-sm font-medium text-gray-700">
                    Total {formatCurrency(packTotal)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {pack.items.map((item) => {
                  const inCart = cartIds.has(item.id);

                  return (
                    <article className="grid grid-cols-[88px_1fr] gap-4 items-center p-3.5 border border-gray-100 rounded-2xl bg-white/50" key={`${pack.id}-${item.id}`}>
                      <div className="relative w-[88px] h-[88px] rounded-xl overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 flex-shrink-0">
                        {item.imageUrl ? (
                          <Image alt={item.originalName} fill sizes="88px" src={getShareableImageUrl(item)} />
                        ) : (
                          <div className="grid place-items-center h-full text-gray-400">No image</div>
                        )}
                      </div>

                      <div className="flex flex-col gap-3 min-w-0">
                        <div>
                          <p className="m-0 text-[10px] uppercase tracking-wide text-gray-500">{item.supermarket}</p>
                          <h3 className="text-base font-semibold leading-snug mt-1 text-gray-900 line-clamp-2">{item.originalName}</h3>
                          <p className="text-sm text-gray-500 mt-1 line-clamp-1">{language === "es" ? item.genericNameEs : item.genericNameEn}</p>
                          <p className="text-sm text-gray-500 line-clamp-1">{item.quantityText} · Qty {item.quantity}</p>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <strong className="text-base text-gray-900">{formatCurrency(item.currentPrice * item.quantity)}</strong>
                          {inCart ? <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-full">In cart</span> : null}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <AddToCartButton item={item} />
                          <FavouriteButton className="h-11 w-11" item={item} />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
