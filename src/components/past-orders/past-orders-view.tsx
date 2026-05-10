"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
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

function buildPeopleSummary(people: PersonData[], orders: PastOrderData[]) {
  return people.map((person) => {
    const paidOrderCount = orders.filter((order) => order.payer?.id === person.id).length;
    const assignedSpend = orders.reduce(
      (orderSum, order) =>
        orderSum +
        order.items.reduce(
          (itemSum, item) => itemSum + item.shares.filter((share) => share.personId === person.id).reduce((shareSum, share) => shareSum + item.totalPrice * (share.percent / 100), 0),
          0,
        ),
      0,
    );
    const owes = orders.reduce(
      (sum, order) => sum + order.settlement.filter((row) => row.fromPersonId === person.id && !row.paidAt).reduce((rowSum, row) => rowSum + row.amount, 0),
      0,
    );
    const isOwed = orders.reduce(
      (sum, order) => sum + order.settlement.filter((row) => row.toPersonId === person.id && !row.paidAt).reduce((rowSum, row) => rowSum + row.amount, 0),
      0,
    );

    return { ...person, paidOrderCount, assignedSpend, owes, isOwed, net: isOwed - owes };
  });
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
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptMeta, setReceiptMeta] = useState<{ rawReceiptText: string | null; receiptImageName: string | null; total: number | null }>({ rawReceiptText: null, receiptImageName: null, total: null });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const cartIds = useMemo(() => new Set(cartItems.map((item) => item.id)), [cartItems]);
  const favouriteIds = useMemo(() => new Set(favouriteItems.map((item) => item.id)), [favouriteItems]);
  const peopleSummary = useMemo(() => buildPeopleSummary(people, orders), [orders, people]);
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
    if (!receiptFile) {
      setFeedback("Choose a receipt image or PDF first.");
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.set("supermarket", supermarket);
      formData.set("image", receiptFile);
      const response = await fetch("/api/past-orders/scan-receipt", { method: "POST", body: formData });
      const payload = (await response.json()) as { result?: ReceiptScanResult & { receiptImageName?: string | null }; error?: string };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "Failed to scan receipt");
      }

      setDraftItems(payload.result.items.map((item) => ({ ...item, localId: crypto.randomUUID() })));
      setReceiptMeta({ rawReceiptText: payload.result.rawReceiptText, receiptImageName: payload.result.receiptImageName ?? receiptFile.name, total: payload.result.total });
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
      setReceiptFile(null);
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

  async function toggleSettlementPaid(order: PastOrderData, row: PastOrderData["settlement"][number]) {
    const response = await fetch(`/api/past-orders/${order.id}/settlement`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromPersonId: row.fromPersonId,
        toPersonId: row.toPersonId,
        paid: !row.paidAt,
      }),
    });
    const payload = (await response.json()) as { order?: PastOrderData; error?: string };

    if (!response.ok || !payload.order) {
      setFeedback(payload.error ?? "Failed to update payment status");
      return;
    }

    setOrders((current) => current.map((entry) => (entry.id === payload.order!.id ? payload.order! : entry)));
  }

  return (
    <section className="flex flex-col gap-6">
      <section className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.4fr] gap-5">
        <div className="flex flex-col gap-5 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">People</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Aclarar cuentas</h1>
            <p className="mt-2 text-sm text-gray-500">Save people once, then click people on each receipt line to assign it. The selected people split that line evenly by default.</p>
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

          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-gray-50">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-white text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 font-medium">Orders paid</th>
                  <th className="px-3 py-2 font-medium">Their items</th>
                  <th className="px-3 py-2 font-medium">They owe</th>
                  <th className="px-3 py-2 font-medium">Owed to them</th>
                  <th className="px-3 py-2 font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {peopleSummary.map((person) => (
                  <tr className="border-t border-gray-100" key={person.id}>
                    <td className="px-3 py-2 font-medium text-gray-900">{person.name}</td>
                    <td className="px-3 py-2">{person.paidOrderCount}</td>
                    <td className="px-3 py-2">{formatCurrency(person.assignedSpend)}</td>
                    <td className="px-3 py-2 text-red-700">{formatCurrency(person.owes)}</td>
                    <td className="px-3 py-2 text-emerald-700">{formatCurrency(person.isOwed)}</td>
                    <td className={`px-3 py-2 font-semibold ${person.net < 0 ? "text-red-700" : "text-emerald-700"}`}>{formatCurrency(person.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              Receipt image or PDF
              <input accept="image/*,application/pdf" onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} type="file" />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="rounded-full bg-blue-600 px-4 py-3 text-sm text-white disabled:opacity-50" disabled={loading || !receiptFile} onClick={scanReceipt} type="button">{loading ? "Working..." : "Scan ticket with AI"}</button>
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
                      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm ${row.paidAt ? "text-gray-500 line-through" : "text-emerald-900"}`} key={`${row.fromPersonId}-${row.toPersonId}`}>
                        <span>{row.fromName} pays {row.toName} <strong>{formatCurrency(row.amount)}</strong></span>
                        <button className={`rounded-full px-3 py-1 text-xs no-underline ${row.paidAt ? "bg-emerald-100 text-emerald-700" : "bg-gray-900 text-white"}`} onClick={() => void toggleSettlementPaid(order, row)} type="button">
                          {row.paidAt ? "✓ Paid" : `Mark ${row.fromName} paid`}
                        </button>
                      </div>
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
          <p className="mt-2 text-gray-500">Add one manually or scan a ticket image/PDF.</p>
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductCardData[]>([]);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  async function searchProducts(value: string) {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      return;
    }

    const params = new URLSearchParams({ search: value, supermarket, limit: "60" });
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
    setShowImport(false);
    setOpen(false);
  }

  function selectProduct(product: ProductCardData | null) {
    onSelect(product);
    setOpen(false);
  }

  return (
    <div>
      <button
        className="grid w-full grid-cols-[56px_1fr_auto] items-center gap-3 rounded-2xl border border-gray-200 bg-white p-2.5 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="relative h-14 w-14 overflow-hidden rounded-xl bg-gradient-to-br from-gray-50 to-gray-100">
          {selected?.imageUrl ? <Image alt={selected.originalName} fill sizes="56px" src={getShareableImageUrl(selected)} /> : <span className="grid h-full place-items-center text-[10px] text-gray-400">No image</span>}
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wide text-gray-500">Linked product</span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-gray-900">{selected?.originalName ?? "Select or import a product"}</span>
          <span className="mt-0.5 block truncate text-xs text-gray-500">{selected ? `${selected.supermarket} · ${formatCurrency(selected.currentPrice)}` : `${supermarket} products only`}</span>
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-700">Change</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-gray-950/55 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Product finder</p>
                <h3 className="mt-1 text-2xl font-bold text-gray-900">Link this receipt line to a {supermarket} item</h3>
                <p className="mt-1 text-sm text-gray-500">Corrections are saved as receipt aliases, so codenames match better next time.</p>
              </div>
              <button className="grid h-10 w-10 place-items-center rounded-full bg-gray-100 text-lg text-gray-700 hover:bg-gray-200" onClick={() => setOpen(false)} type="button" aria-label="Close product finder">×</button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto p-5">
              <input autoFocus onChange={(event) => void searchProducts(event.target.value)} placeholder={`Search ${supermarket} products only`} value={query} />

              <div className="max-h-[46vh] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-2 pr-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {results.map((product) => (
                    <button className="grid grid-cols-[76px_1fr] gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50" key={product.id} onClick={() => selectProduct(product)} type="button">
                      <span className="relative h-20 w-20 overflow-hidden rounded-xl bg-white">
                        {product.imageUrl ? <Image alt={product.originalName} fill sizes="80px" src={getShareableImageUrl(product)} /> : <span className="grid h-full place-items-center text-xs text-gray-400">No image</span>}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-900">{product.originalName}</span>
                        <span className="mt-1 block truncate text-xs text-gray-500">{product.genericNameEn}</span>
                        <span className="mt-2 block text-sm font-semibold text-gray-900">{formatCurrency(product.currentPrice)} · {product.quantityText}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {query && !results.length ? <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">No {supermarket} matches found. Try another search or import it from the store website.</p> : null}

              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
                <button className="rounded-full bg-white px-4 py-2 text-sm text-gray-800 shadow-sm hover:bg-gray-100" onClick={() => setShowImport((current) => !current)} type="button">Not found? Import by link</button>
                {showImport ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input className="min-w-0 flex-1" onChange={(event) => setUrl(event.target.value)} placeholder={`${supermarket} product URL`} value={url} />
                    <button className="rounded-full bg-gray-900 px-4 py-2 text-sm text-white" onClick={importUrl} type="button">Import and select</button>
                  </div>
                ) : null}
                {message ? <p className="mt-2 text-xs text-amber-700">{message}</p> : null}
              </div>

              {selected ? <button className="self-start rounded-full bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100" onClick={() => selectProduct(null)} type="button">Clear linked product</button> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrderItemCard({ item, order, people, language, onOrderChange }: { item: PastOrderItemData; order: PastOrderData; people: PersonData[]; language: "en" | "es"; onOrderChange: (order: PastOrderData) => void }) {
  const initializedRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const [shares, setShares] = useState(() => {
    const shareMap = new Map(item.shares.map((share) => [share.personId, share.percent]));
    return people.map((person) => ({ personId: person.id, percent: shareMap.get(person.id) ?? 0 }));
  });
  const shareTotal = shares.reduce((sum, share) => sum + share.percent, 0);

  function splitEvenly(personIds: string[]) {
    const percent = personIds.length ? 100 / personIds.length : 0;
    return people.map((person) => ({
      personId: person.id,
      percent: personIds.includes(person.id) ? percent : 0,
    }));
  }

  function toggleSharePerson(personId: string) {
    setShares((current) => {
      const selectedIds = current.filter((share) => share.percent > 0).map((share) => share.personId);
      const nextIds = selectedIds.includes(personId)
        ? selectedIds.filter((id) => id !== personId)
        : [...selectedIds, personId];

      return splitEvenly(nextIds);
    });
  }

  function updateSharePercent(personId: string, value: number) {
    setShares((current) => {
      const otherTotal = current.reduce((sum, share) => (share.personId === personId ? sum : sum + share.percent), 0);
      const nextPercent = Math.min(Math.max(value, 0), Math.max(0, 100 - otherTotal));

      return current.map((share) => (share.personId === personId ? { ...share, percent: nextPercent } : share));
    });
  }

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      void saveShares();
    }, 450);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [shares]);

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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Split this line</p>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${shareTotal > 100 ? "bg-red-100 text-red-700" : "bg-white text-gray-600"}`}>{Math.round(shareTotal * 10) / 10}% assigned</span>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {people.map((person) => {
              const active = shares.some((share) => share.personId === person.id && share.percent > 0);

              return (
                <button
                  className={`rounded-full border px-3 py-2 text-sm transition ${active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-100"}`}
                  key={person.id}
                  onClick={() => toggleSharePerson(person.id)}
                  type="button"
                >
                  {person.name}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {people.map((person) => {
              const share = shares.find((entry) => entry.personId === person.id) ?? { personId: person.id, percent: 0 };
              return (
                <label className="flex items-center gap-2 text-sm" key={person.id}>
                  <span className="min-w-20">{person.name}</span>
                  <input min={0} max={100} onChange={(event) => updateSharePercent(person.id, Number(event.target.value))} step="1" type="number" value={Math.round(share.percent * 10) / 10} />
                  <span>%</span>
                </label>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-gray-500">Split changes save automatically.</p>
        </div>
      </div>
    </article>
  );
}
