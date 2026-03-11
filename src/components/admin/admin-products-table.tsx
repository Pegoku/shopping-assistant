"use client";

import { useState } from "react";
import type { ProductCardData } from "@/lib/types";

type AdminProductsTableProps = {
  products: ProductCardData[];
};

export function AdminProductsTable({ products }: AdminProductsTableProps) {
  const [status, setStatus] = useState<string | null>(null);

  async function updatePrice(id: string, nextPrice: number, nextDeal: boolean) {
    setStatus("Saving...");

    const response = await fetch(`/api/admin/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPrice: nextPrice, isDealActive: nextDeal }),
    });

    setStatus(response.ok ? "Saved. Refresh to view latest values." : "Save failed.");
  }

  return (
    <div className="overflow-x-auto">
      {status ? <p className="text-gray-500">{status}</p> : null}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-3 border-b border-gray-200 font-medium text-gray-600">Product</th>
            <th className="p-3 border-b border-gray-200 font-medium text-gray-600">Store</th>
            <th className="p-3 border-b border-gray-200 font-medium text-gray-600">Price</th>
            <th className="p-3 border-b border-gray-200 font-medium text-gray-600">Deal</th>
            <th className="p-3 border-b border-gray-200 font-medium text-gray-600">Unit</th>
            <th className="p-3 border-b border-gray-200 font-medium text-gray-600">Save</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <AdminRow key={product.id} onSave={updatePrice} product={product} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminRow({
  product,
  onSave,
}: {
  product: ProductCardData;
  onSave: (id: string, nextPrice: number, nextDeal: boolean) => Promise<void>;
}) {
  const [price, setPrice] = useState(product.currentPrice);
  const [deal, setDeal] = useState(product.isDealActive);

  return (
    <tr>
      <td className="p-3 border-b border-gray-200 text-gray-900 align-top">
        <strong>{product.originalName}</strong>
        <p>{product.genericNameEn} / {product.genericNameEs}</p>
      </td>
      <td className="p-3 border-b border-gray-200 text-gray-900 align-top">{product.supermarket}</td>
      <td className="p-3 border-b border-gray-200 text-gray-900 align-top">
        <input
          min="0"
          onChange={(event) => setPrice(Number(event.target.value))}
          step="0.01"
          type="number"
          value={price}
        />
      </td>
      <td className="p-3 border-b border-gray-200 text-gray-900 align-top">
        <input checked={deal} onChange={(event) => setDeal(event.target.checked)} type="checkbox" />
      </td>
      <td className="p-3 border-b border-gray-200 text-gray-900 align-top">{product.quantityText}</td>
      <td className="p-3 border-b border-gray-200 text-gray-900 align-top">
        <button className="inline-flex items-center justify-center px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors rounded-full" onClick={() => void onSave(product.id, price, deal)} type="button">
          Save
        </button>
      </td>
    </tr>
  );
}
