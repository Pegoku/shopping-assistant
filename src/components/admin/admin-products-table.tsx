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
    <div className="admin-table-shell">
      {status ? <p className="admin-status">{status}</p> : null}
      <table className="admin-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Store</th>
            <th>Price</th>
            <th>Deal</th>
            <th>Unit</th>
            <th>Save</th>
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
      <td>
        <strong>{product.originalName}</strong>
        <p>{product.genericNameEn} / {product.genericNameEs}</p>
      </td>
      <td>{product.supermarket}</td>
      <td>
        <input
          min="0"
          onChange={(event) => setPrice(Number(event.target.value))}
          step="0.01"
          type="number"
          value={price}
        />
      </td>
      <td>
        <input checked={deal} onChange={(event) => setDeal(event.target.checked)} type="checkbox" />
      </td>
      <td>{product.quantityText}</td>
      <td>
        <button className="ghost-button" onClick={() => void onSave(product.id, price, deal)} type="button">
          Save
        </button>
      </td>
    </tr>
  );
}
