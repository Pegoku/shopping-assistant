"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  dealText: string | null;
  aiConfidence: number | null;
  product: ProductCardData | null;
};

type DraftOrder = {
  localId: string;
  orderedAt: string;
  items: DraftItem[];
  meta: {
    rawReceiptText: string | null;
    receiptImageName: string | null;
    total: number | null;
  };
};

type ImportPage = {
  id: string;
  label: string;
  file: File;
  previewUrl: string;
  group: number;
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
    dealText: null,
    aiConfidence: null,
    product: null,
  };
}

function newDraftOrder(): DraftOrder {
  return {
    localId: crypto.randomUUID(),
    orderedAt: new Date().toISOString().slice(0, 16),
    items: [newDraftItem()],
    meta: { rawReceiptText: null, receiptImageName: null, total: null },
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function productToCartItem(product: ProductCardData, quantity: number): CartItem {
  return { ...toCartItem(product), quantity: Math.max(1, Math.floor(quantity)) };
}

function normalizeReceiptCode(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildPeopleSummary(people: PersonData[], orders: PastOrderData[]) {
  return people.map((person) => {
    const paidOrderCount = orders.filter((order) => order.payer?.id === person.id).length;
    const assignedSpend = orders.reduce(
      (orderSum, order) =>
        orderSum +
        order.items.reduce(
          (itemSum, item) => {
            if (!item.shares.length && people.length) {
              return itemSum + item.totalPrice / people.length;
            }

            return itemSum + item.shares.filter((share) => share.personId === person.id).reduce((shareSum, share) => shareSum + item.totalPrice * (share.percent / 100), 0);
          },
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
    const payees = Array.from(
      new Map(
        orders
          .flatMap((order) => order.settlement)
          .filter((row) => row.fromPersonId === person.id && !row.paidAt)
          .map((row) => [row.toPersonId, { id: row.toPersonId, name: row.toName }]),
      ).values(),
    ).sort((left, right) => left.name.localeCompare(right.name));

    return { ...person, paidOrderCount, assignedSpend, owes, isOwed, net: isOwed - owes, payees };
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
  const [draftOrders, setDraftOrders] = useState<DraftOrder[]>([newDraftOrder()]);
  const [activeDraftOrderIndex, setActiveDraftOrderIndex] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [importPages, setImportPages] = useState<ImportPage[]>([]);
  const [importMode, setImportMode] = useState<"all" | "individual" | "manual">("all");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const cartIds = useMemo(() => new Set(cartItems.map((item) => item.id)), [cartItems]);
  const favouriteIds = useMemo(() => new Set(favouriteItems.map((item) => item.id)), [favouriteItems]);
  const peopleSummary = useMemo(() => buildPeopleSummary(people, orders), [orders, people]);
  const activeDraftOrder = draftOrders[Math.min(activeDraftOrderIndex, draftOrders.length - 1)] ?? draftOrders[0];
  const draftItems = activeDraftOrder?.items ?? [];
  const orderedAt = activeDraftOrder?.orderedAt ?? new Date().toISOString().slice(0, 16);
  const receiptMeta = activeDraftOrder?.meta ?? { rawReceiptText: null, receiptImageName: null, total: null };
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

  async function scanReceiptGroups(groups: ImportPage[][]) {
    if (!groups.length) {
      setFeedback("Add receipt pages before scanning.");
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const scannedOrders = await Promise.all(
        groups.map(async (group) => {
        const formData = new FormData();
        formData.set("supermarket", supermarket);
        group.forEach((page) => formData.append("files", page.file));
        const response = await fetch("/api/past-orders/scan-receipt", { method: "POST", body: formData });
        const payload = (await response.json()) as { result?: ReceiptScanResult & { receiptImageName?: string | null }; error?: string };

        if (!response.ok || !payload.result) {
          throw new Error(payload.error ?? "Failed to scan receipt");
        }

        return {
          localId: crypto.randomUUID(),
          orderedAt: payload.result.orderedAt ? new Date(payload.result.orderedAt).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
          items: payload.result.items.map((item) => ({ ...item, localId: crypto.randomUUID() })),
          meta: {
            rawReceiptText: payload.result.rawReceiptText,
            receiptImageName: payload.result.receiptImageName ?? group.map((page) => page.label).join(", "),
            total: payload.result.total,
          },
        } satisfies DraftOrder;
        }),
      );

      setDraftOrders(scannedOrders.length ? scannedOrders : [newDraftOrder()]);
      setActiveDraftOrderIndex(0);
      setImportOpen(false);
      setFeedback(`Scanned ${scannedOrders.length} order${scannedOrders.length === 1 ? "" : "s"}. Review product links before saving.`);
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
            dealText: item.dealText,
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
      setDraftOrders((current) => {
        const next = current.filter((_, index) => index !== activeDraftOrderIndex);
        return next.length ? next : [newDraftOrder()];
      });
      setActiveDraftOrderIndex((current) => Math.max(0, Math.min(current, draftOrders.length - 2)));
      setFeedback(draftOrders.length > 1 ? "Order saved. Continue with the next scanned order." : "Order saved.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to save order");
    } finally {
      setLoading(false);
    }
  }

  function updateDraftItem(localId: string, patch: Partial<DraftItem>) {
    setDraftOrders((current) => current.map((order, index) => (index === activeDraftOrderIndex ? { ...order, items: order.items.map((item) => (item.localId === localId ? { ...item, ...patch } : item)) } : order)));
  }

  function addDraftItem() {
    setDraftOrders((current) => current.map((order, index) => (index === activeDraftOrderIndex ? { ...order, items: [...order.items, newDraftItem()] } : order)));
  }

  function removeDraftItem(localId: string) {
    setDraftOrders((current) => current.map((order, index) => (index === activeDraftOrderIndex ? { ...order, items: order.items.filter((item) => item.localId !== localId) } : order)));
  }

  function updateActiveDraftOrderedAt(value: string) {
    setDraftOrders((current) => current.map((order, index) => (index === activeDraftOrderIndex ? { ...order, orderedAt: value } : order)));
  }

  async function loadImportFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const { PDFDocument } = await import("pdf-lib");
      const pages: ImportPage[] = [];

      for (const file of Array.from(files)) {
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          const sourceBytes = await file.arrayBuffer();
          const sourcePdf = await PDFDocument.load(sourceBytes);
          const pageCount = sourcePdf.getPageCount();

          for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
            const singlePagePdf = await PDFDocument.create();
            const [copiedPage] = await singlePagePdf.copyPages(sourcePdf, [pageIndex]);
            singlePagePdf.addPage(copiedPage);
            const pageBytes = await singlePagePdf.save();
            const pageBuffer = new ArrayBuffer(pageBytes.byteLength);
            new Uint8Array(pageBuffer).set(pageBytes);
            const pageFile = new File([pageBuffer], `${file.name.replace(/\.pdf$/i, "")}-page-${pageIndex + 1}.pdf`, { type: "application/pdf" });
            pages.push({
              id: crypto.randomUUID(),
              label: `${file.name} · page ${pageIndex + 1}/${pageCount}`,
              file: pageFile,
              previewUrl: URL.createObjectURL(pageFile),
              group: pages.length + 1,
            });
          }
          continue;
        }

        if (file.type.startsWith("image/")) {
          pages.push({
            id: crypto.randomUUID(),
            label: file.name,
            file,
            previewUrl: URL.createObjectURL(file),
            group: pages.length + 1,
          });
        }
      }

      setImportPages(pages);
      setImportMode(pages.length > 1 ? "individual" : "all");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to read receipt files");
    } finally {
      setLoading(false);
    }
  }

  function getImportGroups() {
    if (importMode === "all") {
      return importPages.length ? [importPages] : [];
    }

    if (importMode === "individual") {
      return importPages.map((page) => [page]);
    }

    const byGroup = new Map<number, ImportPage[]>();

    for (const page of importPages) {
      byGroup.set(page.group, [...(byGroup.get(page.group) ?? []), page]);
    }

    return Array.from(byGroup.entries())
      .sort(([left], [right]) => left - right)
      .map(([, pages]) => pages);
  }

  function updateImportPageGroup(pageId: string, group: number) {
    setImportPages((current) => current.map((page) => (page.id === pageId ? { ...page, group: Math.max(1, group) } : page)));
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

  async function markAllPaidTo(fromPersonId: string, toPersonId: string) {
    const rowsToMark = orders.flatMap((order) =>
      order.settlement
        .filter((row) => row.fromPersonId === fromPersonId && !row.paidAt && (toPersonId === "all" || row.toPersonId === toPersonId))
        .map((row) => ({ order, row })),
    );

    for (const { order, row } of rowsToMark) {
      const response = await fetch(`/api/past-orders/${order.id}/settlement`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromPersonId: row.fromPersonId,
          toPersonId: row.toPersonId,
          paid: true,
        }),
      });
      const payload = (await response.json()) as { order?: PastOrderData; error?: string };

      if (!response.ok || !payload.order) {
        setFeedback(payload.error ?? "Failed to update payment status");
        return;
      }

      setOrders((current) => current.map((entry) => (entry.id === payload.order!.id ? payload.order! : entry)));
    }
  }

  function propagateProductRelink(supermarket: "AH" | "JUMBO", receiptName: string, product: ProductCardData | null) {
    const normalized = normalizeReceiptCode(receiptName);
    setOrders((current) =>
      current.map((order) =>
        order.supermarket === supermarket
          ? {
              ...order,
              items: order.items.map((item) => (normalizeReceiptCode(item.receiptName) === normalized ? { ...item, product } : item)),
            }
          : order,
      ),
    );
    setDraftOrders((current) =>
      current.map((order) => ({
        ...order,
        items: order.items.map((item) => (normalizeReceiptCode(item.receiptName) === normalized ? { ...item, product } : item)),
      })),
    );
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
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-white text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 font-medium">Orders paid</th>
                  <th className="px-3 py-2 font-medium">Their items</th>
                  <th className="px-3 py-2 font-medium">They owe</th>
                  <th className="px-3 py-2 font-medium">Owed to them</th>
                  <th className="px-3 py-2 font-medium">Net</th>
                  <th className="px-3 py-2 font-medium">Mark paid to</th>
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
                    <td className="px-3 py-2">
                      {person.payees.length ? (
                        <select
                          className="min-w-36 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs"
                          defaultValue=""
                          onChange={(event) => {
                            const value = event.target.value;
                            event.target.value = "";

                            if (value) {
                              void markAllPaidTo(person.id, value);
                            }
                          }}
                        >
                          <option value="">Choose...</option>
                          {person.payees.length > 1 ? <option value="all">All people</option> : null}
                          {person.payees.map((payee) => (
                            <option key={payee.id} value={payee.id}>{payee.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-400">Nothing owed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-5 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              <input onChange={(event) => updateActiveDraftOrderedAt(event.target.value)} type="datetime-local" value={orderedAt} />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="rounded-full bg-blue-600 px-4 py-3 text-sm text-white disabled:opacity-50" disabled={loading} onClick={() => setImportOpen(true)} type="button">Import receipts with AI</button>
            <button className="rounded-full bg-gray-100 px-4 py-3 text-sm text-gray-700" onClick={addDraftItem} type="button">Add manual item</button>
            <button className="rounded-full bg-gray-900 px-4 py-3 text-sm text-white disabled:opacity-50" disabled={loading} onClick={() => void saveOrder()} type="button">Save order · {formatCurrency(receiptMeta.total ?? draftTotal)}</button>
          </div>

          {feedback ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{feedback}</p> : null}

          {draftOrders.length > 1 ? (
            <div className="flex items-center justify-end gap-2 rounded-2xl bg-gray-50 px-3 py-2">
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg shadow-sm disabled:opacity-40" disabled={activeDraftOrderIndex <= 0} onClick={() => setActiveDraftOrderIndex((current) => Math.max(0, current - 1))} type="button">←</button>
              <span className="text-sm font-medium text-gray-700">{activeDraftOrderIndex + 1}/{draftOrders.length}</span>
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg shadow-sm disabled:opacity-40" disabled={activeDraftOrderIndex >= draftOrders.length - 1} onClick={() => setActiveDraftOrderIndex((current) => Math.min(draftOrders.length - 1, current + 1))} type="button">→</button>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            {draftItems.map((item) => (
              <DraftItemRow
                item={item}
                key={item.localId}
                onChange={(patch) => {
                  updateDraftItem(item.localId, patch);
                  if (Object.prototype.hasOwnProperty.call(patch, "product")) {
                    propagateProductRelink(supermarket, item.receiptName, patch.product ?? null);
                  }
                }}
                onRemove={() => removeDraftItem(item.localId)}
                supermarket={supermarket}
              />
            ))}
          </div>
        </div>
      </section>

      {importOpen ? (
        <ReceiptImportModal
          groups={getImportGroups()}
          importMode={importMode}
          loading={loading}
          onClose={() => setImportOpen(false)}
          onFiles={loadImportFiles}
          onGroupChange={updateImportPageGroup}
          onModeChange={setImportMode}
          onScan={(groups) => void scanReceiptGroups(groups)}
          pages={importPages}
        />
      ) : null}

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
                    <OrderItemCard
                      item={item}
                      key={item.id}
                      language={language}
                      onOrderChange={(nextOrder) => setOrders((current) => current.map((entry) => (entry.id === nextOrder.id ? nextOrder : entry)))}
                      onProductRelink={(product) => propagateProductRelink(order.supermarket, item.receiptName, product)}
                      order={order}
                      people={people}
                    />
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

function ReceiptImportModal({
  groups,
  importMode,
  loading,
  onClose,
  onFiles,
  onGroupChange,
  onModeChange,
  onScan,
  pages,
}: {
  groups: ImportPage[][];
  importMode: "all" | "individual" | "manual";
  loading: boolean;
  onClose: () => void;
  onFiles: (files: FileList | null) => void;
  onGroupChange: (pageId: string, group: number) => void;
  onModeChange: (mode: "all" | "individual" | "manual") => void;
  onScan: (groups: ImportPage[][]) => void;
  pages: ImportPage[];
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-gray-950/55 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Receipt import</p>
            <h3 className="mt-1 text-2xl font-bold text-gray-900">Split images and PDF pages into orders</h3>
            <p className="mt-1 text-sm text-gray-500">Upload multiple images or PDFs. Multipage PDFs are split into page previews so you can choose how to group them.</p>
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-gray-100 text-lg text-gray-700 hover:bg-gray-200" onClick={onClose} type="button" aria-label="Close receipt import">×</button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto p-5">
          <label className="flex flex-col gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
            Add images or PDFs
            <input accept="image/*,application/pdf" multiple onChange={(event) => onFiles(event.target.files)} type="file" />
          </label>

          {pages.length ? (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <button className={`rounded-2xl border px-4 py-3 text-left ${importMode === "all" ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`} onClick={() => onModeChange("all")} type="button">
                  <strong className="block text-gray-900">All pages are one order</strong>
                  <span className="text-sm text-gray-500">Useful when one receipt spans multiple pages/files.</span>
                </button>
                <button className={`rounded-2xl border px-4 py-3 text-left ${importMode === "individual" ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`} onClick={() => onModeChange("individual")} type="button">
                  <strong className="block text-gray-900">Split into individual orders</strong>
                  <span className="text-sm text-gray-500">Each image/page becomes its own order.</span>
                </button>
                <button className={`rounded-2xl border px-4 py-3 text-left ${importMode === "manual" ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`} onClick={() => onModeChange("manual")} type="button">
                  <strong className="block text-gray-900">Manual groups</strong>
                  <span className="text-sm text-gray-500">Assign group numbers to combine pages.</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {pages.map((page) => (
                  <article className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50" key={page.id}>
                    <div className="relative h-64 bg-white">
                      {page.file.type.startsWith("image/") ? (
                        <Image alt={page.label} className="object-contain" fill sizes="(max-width: 768px) 100vw, 320px" src={page.previewUrl} unoptimized />
                      ) : (
                        <iframe className="h-full w-full" src={`${page.previewUrl}#toolbar=0&navpanes=0`} title={page.label} />
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 p-3">
                      <p className="min-w-0 truncate text-sm font-medium text-gray-900">{page.label}</p>
                      {importMode === "manual" ? (
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          Group
                          <input className="w-16 rounded-xl border border-gray-200 px-2 py-1" min={1} onChange={(event) => onGroupChange(page.id, Number(event.target.value))} type="number" value={page.group} />
                        </label>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-sm text-gray-600">This will scan <strong>{groups.length}</strong> order{groups.length === 1 ? "" : "s"} from <strong>{pages.length}</strong> page/file{pages.length === 1 ? "" : "s"}.</p>
                <button className="rounded-full bg-blue-600 px-5 py-3 text-sm text-white disabled:opacity-50" disabled={loading || !groups.length} onClick={() => onScan(groups)} type="button">
                  {loading ? "Scanning..." : "Scan grouped orders"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DraftItemRow({ item, onChange, onRemove, supermarket }: { item: DraftItem; onChange: (patch: Partial<DraftItem>) => void; onRemove: () => void; supermarket: "AH" | "JUMBO" }) {
  return (
    <article className="grid grid-cols-1 lg:grid-cols-[1fr_110px_120px_1.1fr_1.4fr_auto] gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
      <input onChange={(event) => onChange({ receiptName: event.target.value })} placeholder="Receipt name / codename" value={item.receiptName} />
      <input min={0.01} onChange={(event) => onChange({ quantity: Number(event.target.value) })} step="0.01" type="number" value={item.quantity} />
      <input min={0} onChange={(event) => onChange({ totalPrice: Number(event.target.value) })} step="0.01" type="number" value={item.totalPrice} />
      <DealPicker dealText={item.dealText} onChange={(dealText) => onChange({ dealText })} />
      <ProductPicker onSelect={(product) => onChange({ product })} priceHint={item.totalPrice} selected={item.product} supermarket={supermarket} />
      <button className="rounded-full bg-white px-3 py-2 text-sm text-gray-600" onClick={onRemove} type="button">Remove</button>
    </article>
  );
}

function DealPicker({ dealText, onChange }: { dealText: string | null; onChange: (dealText: string | null) => void }) {
  const [kind, setKind] = useState<"none" | "bogo" | "percent" | "amount" | "custom">(dealText ? "custom" : "none");
  const [value, setValue] = useState("");
  const [custom, setCustom] = useState(dealText ?? "");

  function apply(nextKind: typeof kind, nextValue = value, nextCustom = custom) {
    setKind(nextKind);

    if (nextKind === "none") {
      onChange(null);
      return;
    }

    if (nextKind === "bogo") {
      onChange("1+1 free");
      return;
    }

    if (nextKind === "percent") {
      onChange(nextValue ? `${nextValue}% off` : null);
      return;
    }

    if (nextKind === "amount") {
      onChange(nextValue ? `€${nextValue} off` : null);
      return;
    }

    onChange(nextCustom.trim() || null);
  }

  return (
    <div className="flex flex-col gap-2">
      <select onChange={(event) => apply(event.target.value as typeof kind)} value={kind}>
        <option value="none">No deal</option>
        <option value="bogo">1+1 free</option>
        <option value="percent">% off</option>
        <option value="amount">€ off</option>
        <option value="custom">Custom</option>
      </select>
      {kind === "percent" || kind === "amount" ? (
        <input
          min={0}
          onChange={(event) => {
            setValue(event.target.value);
            apply(kind, event.target.value);
          }}
          placeholder={kind === "percent" ? "Discount %" : "Discount €"}
          step="0.01"
          type="number"
          value={value}
        />
      ) : null}
      {kind === "custom" ? (
        <input
          onChange={(event) => {
            setCustom(event.target.value);
            apply("custom", value, event.target.value);
          }}
          placeholder="Custom deal"
          value={custom}
        />
      ) : null}
      {dealText ? <span className="rounded-full bg-orange-50 px-3 py-1 text-xs text-orange-700">{dealText}</span> : null}
    </div>
  );
}

function ProductPicker({ selected, supermarket, onSelect, priceHint }: { selected: ProductCardData | null; supermarket: "AH" | "JUMBO"; onSelect: (product: ProductCardData | null) => void; priceHint?: number | null }) {
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

    if (typeof priceHint === "number" && Number.isFinite(priceHint) && priceHint > 0) {
      params.set("priceHint", String(priceHint));
    }
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

function OrderItemCard({
  item,
  order,
  people,
  language,
  onOrderChange,
  onProductRelink,
}: {
  item: PastOrderItemData;
  order: PastOrderData;
  people: PersonData[];
  language: "en" | "es";
  onOrderChange: (order: PastOrderData) => void;
  onProductRelink: (product: ProductCardData | null) => void;
}) {
  const initializedRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const [shares, setShares] = useState(() => {
    const shareMap = new Map(item.shares.map((share) => [share.personId, share.percent]));
    return people.map((person) => ({ personId: person.id, percent: shareMap.get(person.id) ?? 0 }));
  });
  const selectedShareCount = shares.filter((share) => share.percent > 0).length;
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

  async function linkProduct(product: ProductCardData | null) {
    const response = await fetch(`/api/past-orders/${order.id}/items/${item.id}/link`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product?.id ?? null }),
    });
    const payload = (await response.json()) as { order?: PastOrderData };
    onProductRelink(product);
    if (payload.order) {
      onOrderChange(payload.order);
    }
  }

  const saveShares = useCallback(async () => {
    const response = await fetch(`/api/past-orders/${order.id}/items/${item.id}/shares`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shares }),
    });
    const payload = (await response.json()) as { order?: PastOrderData };
    if (payload.order) {
      onOrderChange(payload.order);
    }
  }, [item.id, onOrderChange, order.id, shares]);

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
  }, [saveShares]);

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
          {item.dealText ? <p className="mt-1 inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">{item.dealText}</p> : null}
          {item.product ? <p className="text-sm text-gray-500 capitalize">{language === "es" ? item.product.genericNameEs : item.product.genericNameEn}</p> : null}
        </div>

        {item.product ? <div className="flex flex-wrap gap-2"><AddToCartButton item={productToCartItem(item.product, item.quantity)} /><FavouriteButton className="h-11 w-11" item={toFavouriteItem(item.product)} /></div> : null}

        <ProductPicker onSelect={linkProduct} priceHint={item.totalPrice} selected={item.product} supermarket={order.supermarket} />

        <div className="rounded-2xl bg-gray-50 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Split this line</p>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${shareTotal > 100 ? "bg-red-100 text-red-700" : "bg-white text-gray-600"}`}>{selectedShareCount ? `${Math.round(shareTotal * 10) / 10}% assigned` : "Even split"}</span>
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
        </div>
      </div>
    </article>
  );
}
