"use client";

import Link from "next/link";
import { useCart } from "@/components/providers/cart-provider";

export function CartLink() {
  const { items } = useCart();

  return (
    <Link className="cart-link" href="/cart">
      Cart
      <span>{items.length}</span>
    </Link>
  );
}
