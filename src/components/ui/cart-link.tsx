"use client";

import Link from "next/link";
import { useCart } from "@/components/providers/cart-provider";

export function CartLink() {
  const { items } = useCart();

  return (
    <Link className="inline-flex items-center gap-2 px-3 py-2 bg-white/40 hover:bg-black/5 transition-colors rounded-full" href="/cart">
      Cart
      <span>{items.length}</span>
    </Link>
  );
}
