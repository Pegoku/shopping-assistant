"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { FavouriteButton } from "@/components/product/favourite-button";
import { useLanguage } from "@/components/providers/language-provider";
import { useCart } from "@/components/providers/cart-provider";
import { getShareableImageUrl } from "@/lib/cart-share";
import { formatCurrency } from "@/lib/utils";

type WhatsAppStatusPayload = {
  provider: "webjs" | "meta";
  ready: boolean;
  defaultTo: string | null;
  requiresRecipient: boolean;
  auth: {
    state: "idle" | "initializing" | "qr" | "ready" | "auth_failure" | "disconnected";
    qrCodeDataUrl: string | null;
    error: string | null;
  };
};

export function CartView() {
  const { items, removeItem, clearCart } = useCart();
  const { language } = useLanguage();
  const [recipient, setRecipient] = useState("");
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppStatusPayload | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isClearingChat, setIsClearingChat] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadStatus() {
      try {
        const response = await fetch("/api/whatsapp/status", { cache: "no-store" });
        const data = (await response.json()) as WhatsAppStatusPayload;

        if (!isMounted) {
          return;
        }

        setWhatsAppStatus(data);
        setRecipient((current) => current || data.defaultTo || "");
        setStatusError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setStatusError(error instanceof Error ? error.message : "Failed to load WhatsApp status.");
      }
    }

    void loadStatus();

    const interval = window.setInterval(() => {
      void loadStatus();
    }, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

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
  const resolvedRecipient = recipient.trim() || whatsAppStatus?.defaultTo || "";
  const providerReady = whatsAppStatus?.provider === "meta" ? whatsAppStatus.ready : whatsAppStatus?.ready;
  const canSend = Boolean(items.length && resolvedRecipient && providerReady && !isSending);

  async function handleSendToWhatsApp() {
    setIsSending(true);
    setSendFeedback(null);

    try {
      const response = await fetch("/api/whatsapp/send-cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items,
          to: recipient.trim() || undefined,
        }),
      });

      const data = (await response.json()) as { error?: string; sentCount?: number; to?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to send WhatsApp messages.");
      }

      setSendFeedback(`Sent ${data.sentCount ?? items.length} product messages to ${data.to ?? resolvedRecipient}.`);
      setStatusError(null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to send WhatsApp messages.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleClearChat() {
    setIsClearingChat(true);
    setSendFeedback(null);

    try {
      const response = await fetch("/api/whatsapp/clear-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: recipient.trim() || undefined,
        }),
      });

      const data = (await response.json()) as { error?: string; to?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to clear WhatsApp chat.");
      }

      setSendFeedback(`Cleared WhatsApp chat for ${data.to ?? resolvedRecipient}.`);
      setStatusError(null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to clear WhatsApp chat.");
    } finally {
      setIsClearingChat(false);
    }
  }

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

        <div className="flex flex-col gap-3 p-4 rounded-2xl bg-green-50 border border-green-100">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs tracking-wide uppercase text-green-700 font-medium">WhatsApp</span>
            <span className="text-xs text-green-800">{whatsAppStatus?.provider === "meta" ? "Official API" : "whatsapp-web.js"}</span>
          </div>

          <label className="flex flex-col gap-1.5 text-sm text-gray-700">
            Recipient number
            <input
              className="px-3 py-2 rounded-xl border border-green-200 bg-white text-gray-900 outline-none focus:border-green-500"
              onChange={(event) => setRecipient(event.target.value)}
              placeholder={whatsAppStatus?.defaultTo ?? "31612345678"}
              type="tel"
              value={recipient}
            />
          </label>

          {whatsAppStatus?.provider === "webjs" && !whatsAppStatus.ready ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-white p-3 border border-green-100">
              <p className="text-sm text-gray-700">Scan the QR code with WhatsApp Linked Devices to enable automatic sending.</p>
              {whatsAppStatus.auth.qrCodeDataUrl ? (
                <Image alt="WhatsApp QR code" className="rounded-xl border border-green-100 bg-white" height={280} src={whatsAppStatus.auth.qrCodeDataUrl} unoptimized width={280} />
              ) : (
                <p className="text-sm text-gray-500">Waiting for QR code...</p>
              )}
            </div>
          ) : null}

          {whatsAppStatus ? (
            <p className="text-sm text-gray-600">
              {whatsAppStatus.ready ? "Ready to send product images." : `Status: ${whatsAppStatus.auth.state.replaceAll("_", " ")}.`}
            </p>
          ) : null}

          {sendFeedback ? <p className="text-sm text-green-700">{sendFeedback}</p> : null}
          {statusError ? <p className="text-sm text-red-600">{statusError}</p> : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="inline-flex items-center justify-center px-4 py-3 bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition-colors rounded-full"
              disabled={!canSend}
              onClick={handleSendToWhatsApp}
              type="button"
            >
              {isSending ? "Sending..." : "Send to WhatsApp"}
            </button>
            <button
              className="inline-flex items-center justify-center px-4 py-3 bg-white text-green-800 border border-green-200 hover:bg-green-100 transition-colors rounded-full"
              disabled={!resolvedRecipient || isClearingChat}
              onClick={handleClearChat}
              type="button"
            >
              {isClearingChat ? "Clearing..." : "Clear chat"}
            </button>
          </div>
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
                      <Image alt={item.originalName} fill sizes="88px" src={getShareableImageUrl(item)} />
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
                    <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                      <FavouriteButton className="h-9 w-9" item={item} />
                      <button className="p-0 text-blue-600 bg-transparent hover:text-blue-700 transition-colors" onClick={() => removeItem(item.id)} type="button">
                        Remove
                      </button>
                    </div>
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
