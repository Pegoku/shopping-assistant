"use client";

import Link from "next/link";
import { usePastOrders } from "@/components/providers/past-orders-provider";

export function PastOrdersLink() {
  const { packs } = usePastOrders();

  return (
    <Link className="inline-flex items-center gap-2 px-3 py-2 bg-white/40 hover:bg-black/5 transition-colors rounded-full" href="/past-orders">
      Past orders
      <span>{packs.length}</span>
    </Link>
  );
}
