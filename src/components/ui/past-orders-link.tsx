"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePastOrders } from "@/components/providers/past-orders-provider";

export function PastOrdersLink() {
  const { packs } = usePastOrders();
  const [remoteCount, setRemoteCount] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCount() {
      const response = await fetch("/api/past-orders", { cache: "no-store" });
      const payload = (await response.json()) as { orders?: unknown[] };

      if (isMounted) {
        setRemoteCount(payload.orders?.length ?? null);
      }
    }

    void loadCount().catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Link className="inline-flex items-center gap-2 px-3 py-2 bg-white/40 hover:bg-black/5 transition-colors rounded-full" href="/past-orders">
      Past orders
      <span>{remoteCount ?? packs.length}</span>
    </Link>
  );
}
