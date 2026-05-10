"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { FavouriteButton } from "@/components/product/favourite-button";
import { useCart } from "@/components/providers/cart-provider";
import { useFavourites } from "@/components/providers/favourites-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { getShareableImageUrl } from "@/lib/cart-share";
import { toCartItem, toFavouriteItem } from "@/lib/product-items";
import type { CartItem, PastOrderData, PastOrderItemData, PersonData, ProductCardData, ReceiptScanResult } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type DraftItem = {
  localId: string;
  receiptName: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  aiConfidence: number | null;
  product: ProductCardData | null;
};

type PastOrdersViewProps = {
  initialOrders: PastOrderData[];
  initialPeople: PersonData[];
};

function newDraftItem(): DraftItem {
  return {
    localId: crypto.randomUUID(),
    receiptName: "",
    quantity: 1,
    unitPrice: null,
    totalPrice: 0,
    aiConfidence: null,
    product: null,
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function productToCartItem(product: ProductCardData, quantity: number): CartItem {
  return { ...toCartItem(product), quantity: Math.max(1, Math.floor(quantity)) };
}

export function PastOrdersView({ initialOrders, initialPeople }: PastOrdersViewProps) {
  const { addItems, items: cartItems } = useCart();
  const { addItems: addFavouriteItems, items: favouriteItems } = useFavourites();
  const { language } = useLanguage();
  const [orders, setOrders] = useState(initialOrders);
  const [people, setPeople] = useState(initialPeople);
  const [personName, setPersonName] = useState("");
  const [supermarket, setSupermarket] = useState<"AH" | "JUMBO">("JUMBO");
  const [payerId, setPayerId] = useState(initialPeople[0]?.id ?? "");
  const [participantIds, setParticipantIds] = useState<string[]>(initialPeople.slice(0, 2).map((person) => person.id));
  const [orderedAt, setOrderedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [draftItems, setDraftItems] = useState<DraftItem[]>([newDraftItem()]);
  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [receiptMeta, setReceiptMeta] = useState<{ rawReceiptText: string | null; receiptImageName: string | null; total: number | null }>({ rawReceiptText: null, receiptImageName: null, total: null });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const cartIds = useMemo(() => new Set(cartItems.map((item) => item.id)), [cartItems]);
  const favouriteIds = useMemo(() => new Set(favouriteItems.map((item) => item.id)), [favouriteItems]);
  const draftTotal = draftItems.reduce((sum, item) => sum + item.totalPrice, 0);

  async function addPerson() {
    if (!personName.trim()) {
      return;
    }

    const response = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: personName }),
    });
    const payload = (await response.json()) as { person?: PersonData; error?: string };

    if (!response.ok || !payload.person) {
      setFeedback(payload.error ?? "Failed to save person");
      return;
    }

    setPeople((current) => (current.some((person) => person.id === payload.person!.id) ? current : [...current, payload.person!].sort((left, right) => left.name.localeCompare(right.name))));
    setParticipantIds((current) => (current.includes(payload.person!.id) ? current : [...current, payload.person!.id]));
    setPayerId((current) => current || payload.person!.id);
    setPersonName("");
  }

  async function scanReceipt() {
    if (!receiptImage) {
      setFeedback("Choose a receipt image first.");
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.set("supermarket", supermarket);
      formData.set("image", receiptImage);
      const response = await fetch("/api/past-orders/scan-receipt", { method: "POST", body: formData });
      const payload = (await response.json()) as { result?: ReceiptScanResult & { receiptImageName?: string | null }; error?: string };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "Failed to scan receipt");
      }

      setDraftItems(payload.result.items.map((item) => ({ ...item, localId: crypto.randomUUID() })));
      setReceiptMeta({ rawReceiptText: payload.result.rawReceiptText, receiptImageName: payload.result.receiptImageName ?? receiptImage.name, total: payload.result.total });
      if (payload.result.orderedAt) {
        setOrderedAt(new Date(payload.result.orderedAt).toISOString().slice(0, 16));
      }
      setFeedback(`Scanned ${payload.result.items.length} lines. Review product links before saving.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to scan receipt");
    } finally {
      setLoading(false);
    }
  }

  async function saveOrder(source: "MANUAL" | "AI_RECEIPT" = receiptMeta.rawReceiptText ? "AI_RECEIPT" : "MANUAL") {
    const items = draftItems.filter((item) => item.receiptName.trim() && item.totalPrice >= 0);

    if (!items.length) {
      setFeedback("Add at least one item.");
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/past-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supermarket,
          source,
          orderedAt,
          payerId: payerId || null,
          participantIds,
          total: receiptMeta.total ?? draftTotal,
          rawReceiptText: receiptMeta.rawReceiptText,
          receiptImageName: receiptMeta.receiptImageName,
          items: items.map((item) => ({
            receiptName: item.receiptName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            productId: item.product?.id ?? null,
            aiConfidence: item.aiConfidence,
          })),
        }),
      });
      const payload = (await response.json()) as { order?: PastOrderData; error?: string };

      if (!response.ok || !payload.order) {
        throw new Error(payload.error ?? "Failed to save order");
      }

      setOrders((current) => [payload.order!, ...current]);
      setDraftItems([newDraftItem()]);
      setReceiptMeta({ rawReceiptText: null, receiptImageName: null, total: null });
      setReceiptImage(null);
      setFeedback("Order saved.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to save order");
    } finally {
      setLoading(false);
    }
  }

  function updateDraftItem(localId: string, patch: Partial<DraftItem>) {
    setDraftItems((current) => current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }

  return (
    <section className="flex flex-col gap-6">
      <section className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.4fr] gap-5">
        <div className="flex flex-col gap-5 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">People</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Aclarar cuentas</h1>
            <p className="mt-2 text-sm text-gray-500">Save people once, then split every receipt line. New orders default to equal shares across selected participants.</p>
          </div>

          <div className="flex gap-2">
            <input className="min-w-0 flex-1" onChange={(event) => setPersonName(event.target.value)} placeholder="Name" value={personName} />
            <button className="rounded-full bg-gray-900 px-4 py-2 text-sm text-white" onClick={addPerson} type="button">Add</button>
          </div>

          <div className="flex flex-wrap gap-2">
            {people.map((person) => (
              <label className={`rounded-full border px-3 py-2 text-sm ${participantIds.includes(person.id) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50"}`} key={person.id}>
                <input
                  checked={participantIds.includes(person.id)}
                  className="mr-2"
                  onChange={(event) => setParticipantIds((current) => (event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id)))}
                  type="checkbox"
                />
                {person.name}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-5 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="flex flex-col gap-2 text-sm">
              Store
              <select onChange={(event) => setSupermarket(event.target.value as "AH" | "JUMBO")} value={supermarket}>
                <option value="JUMBO">Jumbo</option>
                <option value="AH">Albert Heijn</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Paid by
              <select onChange={(event) => setPayerId(event.target.value)} value={payerId}>
                <option value="">Nobody selected</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Date
              <input onChange={(event) => setOrderedAt(event.target.value)} type="datetime-local" value={orderedAt} />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Receipt image
              <input accept="image/*" onChange={(event) => setReceiptImage(event.target.files?.[0] ?? null)} type="file" />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="rounded-full bg-blue-600 px-4 py-3 text-sm text-white disabled:opacity-50" disabled={loading || !receiptImage} onClick={scanReceipt} type="button">{loading ? "Working..." : "Scan ticket with AI"}</button>
            <button className="rounded-full bg-gray-100 px-4 py-3 text-sm text-gray-700" onClick={() => setDraftItems((current) => [...current, newDraftItem()])} type="button">Add manual item</button>
            <button className="rounded-full bg-gray-900 px-4 py-3 text-sm text-white disabled:opacity-50" disabled={loading} onClick={() => void saveOrder()} type="button">Save order · {formatCurrency(receiptMeta.total ?? draftTotal)}</button>
          </div>

          {feedback ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{feedback}</p> : null}

          <div className="flex flex-col gap-3">
            {draftItems.map((item) => (
              <DraftItemRow
                item={item}
                key={item.localId}
                onChange={(patch) => updateDraftItem(item.localId, patch)}
                onRemove={() => setDraftItems((current) => current.filter((entry) => entry.localId !== item.localId))}
                supermarket={supermarket}
              />
            ))}
          </div>
        </div>
      </section>

      {orders.length ? (
        <div className="flex flex-col gap-4">
          {orders.map((order) => {
            const linkedProducts = order.items.filter((item) => item.product).map((item) => productToCartItem(item.product!, item.quantity));
            const notInCart = linkedProducts.filter((item) => !cartIds.has(item.id));
            const notInFavourites = linkedProducts.filter((item) => !favouriteIds.has(item.id));

            return (
              <section className="flex flex-col gap-4 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm" key={order.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">{order.supermarket} · {order.source.replace("_", " ")} · {formatDate(order.orderedAt)}</p>
                    <h2 className="mt-2 text-2xl font-bold text-gray-900">{order.items.length} receipt lines · {formatCurrency(order.total)}</h2>
                    <p className="mt-1 text-sm text-gray-500">Paid by {order.payer?.name ?? "nobody yet"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="rounded-full bg-blue-600 px-4 py-3 text-sm text-white disabled:opacity-50" disabled={!notInCart.length} onClick={() => addItems(notInCart)} type="button">Add linked items to cart</button>
                    <button className="rounded-full bg-rose-50 px-4 py-3 text-sm text-rose-700 disabled:opacity-50" disabled={!notInFavourites.length} onClick={() => addFavouriteItems(notInFavourites)} type="button">Add to favourites</button>
                  </div>
                </div>

                {order.settlement.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 rounded-2xl bg-emerald-50 p-3">
                    {order.settlement.map((row) => (
                      <div className="rounded-xl bg-white px-3 py-2 text-sm text-emerald-900" key={`${row.fromPersonId}-${row.toPersonId}`}>{row.fromName} pays {row.toName} <strong>{formatCurrency(row.amount)}</strong></div>
                    ))}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {order.items.map((item) => (
                    <OrderItemCard item={item} key={item.id} language={language} onOrderChange={(nextOrder) => setOrders((current) => current.map((entry) => (entry.id === nextOrder.id ? nextOrder : entry)))} order={order} people={people} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="rounded-3xl border border-gray-100 bg-white p-6 text-center shadow-sm">
          <h2 className="text-3xl font-bold text-gray-900">No past orders yet</h2>
          <p className="mt-2 text-gray-500">Add one manually or scan a ticket image.</p>
        </section>
      )}
    </section>
  );
}

function DraftItemRow({ item, onChange, onRemove, supermarket }: { item: DraftItem; onChange: (patch: Partial<DraftItem>) => void; onRemove: () => void; supermarket: "AH" | "JUMBO" }) {
  return (
    <article className="grid grid-cols-1 lg:grid-cols-[1fr_120px_140px_1.4fr_auto] gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
      <input onChange={(event) => onChange({ receiptName: event.target.value })} placeholder="Receipt name / codename" value={item.receiptName} />
      <input min={0.01} onChange={(event) => onChange({ quantity: Number(event.target.value) })} step="0.01" type="number" value={item.quantity} />
      <input min={0} onChange={(event) => onChange({ totalPrice: Number(event.target.value) })} step="0.01" type="number" value={item.totalPrice} />
      <ProductPicker onSelect={(product) => onChange({ product })} selected={item.product} supermarket={supermarket} />
      <button className="rounded-full bg-white px-3 py-2 text-sm text-gray-600" onClick={onRemove} type="button">Remove</button>
    </article>
  );
}

function ProductPicker({ selected, supermarket, onSelect }: { selected: ProductCardData | null; supermarket: "AH" | "JUMBO"; onSelect: (product: ProductCardData | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductCardData[]>([]);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function searchProducts(value: string) {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      return;
    }

    const params = new URLSearchParams({ search: value, supermarket, limit: "8" });
    const response = await fetch(`/api/products?${params.toString()}`, { cache: "no-store" });
    const payload = (await response.json()) as { products: ProductCardData[] };
    setResults(payload.products);
  }

  async function importUrl() {
    setMessage(null);
    const response = await fetch("/api/products/import-from-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, supermarket }),
    });
    const payload = (await response.json()) as { product?: ProductCardData; error?: string };

    if (!response.ok || !payload.product) {
      setMessage(payload.error ?? "Import failed");
      return;
    }

    onSelect(payload.product);
    setMessage("Product imported and selected.");
    setUrl("");
  }

  return (
    <div className="flex flex-col gap-2">
      {selected ? <p className="rounded-xl bg-white px-3 py-2 text-xs text-gray-700">Linked: <strong>{selected.originalName}</strong></p> : <p className="text-xs text-gray-500">No product linked</p>}
      <input onChange={(event) => void searchProducts(event.target.value)} placeholder={`Search ${supermarket} products only`} value={query} />
      {results.length ? (
        <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-100 bg-white">
          {results.map((product) => (
            <button className="block w-full px-3 py-2 text-left text-xs hover:bg-gray-50" key={product.id} onClick={() => onSelect(product)} type="button">{product.originalName} · {formatCurrency(product.currentPrice)}</button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <input className="min-w-0 flex-1" onChange={(event) => setUrl(event.target.value)} placeholder={`${supermarket} product URL`} value={url} />
        <button className="rounded-full bg-gray-900 px-3 py-2 text-xs text-white" onClick={importUrl} type="button">Import</button>
      </div>
      {message ? <p className="text-xs text-amber-700">{message}</p> : null}
    </div>
  );
}

function OrderItemCard({ item, order, people, language, onOrderChange }: { item: PastOrderItemData; order: PastOrderData; people: PersonData[]; language: "en" | "es"; onOrderChange: (order: PastOrderData) => void }) {
  const [shares, setShares] = useState(() => {
    const shareMap = new Map(item.shares.map((share) => [share.personId, share.percent]));
    return people.map((person) => ({ personId: person.id, percent: shareMap.get(person.id) ?? 0 }));
  });

  async function linkProduct(product: ProductCardData | null) {
    const response = await fetch(`/api/past-orders/${order.id}/items/${item.id}/link`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product?.id ?? null }),
    });
    const payload = (await response.json()) as { order?: PastOrderData };
    if (payload.order) {
      onOrderChange(payload.order);
    }
  }

  async function saveShares() {
    const response = await fetch(`/api/past-orders/${order.id}/items/${item.id}/shares`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shares }),
    });
    const payload = (await response.json()) as { order?: PastOrderData };
    if (payload.order) {
      onOrderChange(payload.order);
    }
  }

  return (
    <article className="grid grid-cols-1 md:grid-cols-[88px_1fr] gap-4 rounded-2xl border border-gray-100 bg-white/50 p-3.5">
      <div className="relative h-[88px] w-[88px] overflow-hidden rounded-xl bg-gradient-to-br from-gray-50 to-gray-100">
        {item.product?.imageUrl ? <Image alt={item.product.originalName} fill sizes="88px" src={getShareableImageUrl(item.product)} /> : <div className="grid h-full place-items-center text-xs text-gray-400">No image</div>}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Receipt: {item.receiptName}</p>
          <h3 className="mt-1 text-base font-semibold text-gray-900">{item.product ? item.product.originalName : "Unlinked product"}</h3>
          <p className="text-sm text-gray-500">Qty {item.quantity} · {formatCurrency(item.totalPrice)}{item.aiConfidence ? ` · confidence ${Math.round(item.aiConfidence * 100)}%` : ""}</p>
          {item.product ? <p className="text-sm text-gray-500 capitalize">{language === "es" ? item.product.genericNameEs : item.product.genericNameEn}</p> : null}
        </div>

        {item.product ? <div className="flex flex-wrap gap-2"><AddToCartButton item={productToCartItem(item.product, item.quantity)} /><FavouriteButton className="h-11 w-11" item={toFavouriteItem(item.product)} /></div> : null}

        <ProductPicker onSelect={linkProduct} selected={item.product} supermarket={order.supermarket} />

        <div className="rounded-2xl bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Split this line</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {people.map((person) => {
              const share = shares.find((entry) => entry.personId === person.id) ?? { personId: person.id, percent: 0 };
              return (
                <label className="flex items-center gap-2 text-sm" key={person.id}>
                  <span className="min-w-20">{person.name}</span>
                  <input min={0} onChange={(event) => setShares((current) => current.map((entry) => (entry.personId === person.id ? { ...entry, percent: Number(event.target.value) } : entry)))} step="1" type="number" value={share.percent} />
                  <span>%</span>
                </label>
              );
            })}
          </div>
          <button className="mt-3 rounded-full bg-gray-900 px-4 py-2 text-sm text-white" onClick={saveShares} type="button">Save split</button>
        </div>
      </div>
    </article>
  );
}
