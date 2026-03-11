"use client";

import { useState } from "react";

export function ForceFetchButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onForceFetch() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/fetch", { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; error?: string; itemsFetched?: number };

      if (!response.ok || !payload.ok) {
        setMessage(payload.error ?? "Fetch failed");
      } else {
        setMessage(`Fetch completed. ${payload.itemsFetched ?? 0} items processed.`);
      }
    } catch {
      setMessage("Fetch failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col justify-center gap-3">
      <button className="px-4 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={loading} onClick={onForceFetch} type="button">
        {loading ? "Fetching..." : "Force fetch now"}
      </button>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
