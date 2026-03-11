"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ForceFetchButton } from "@/components/admin/force-fetch-button";
import type { FetchRunSummary } from "@/lib/types";

export function AdminLivePanel({
  initialRun,
  initialRuns,
}: {
  initialRun: FetchRunSummary | null;
  initialRuns: FetchRunSummary[];
}) {
  const [run, setRun] = useState<FetchRunSummary | null>(initialRun);
  const [runs, setRuns] = useState<FetchRunSummary[]>(initialRuns);

  useEffect(() => {
    if (!run || run.status !== "PENDING") {
      return;
    }

    const interval = window.setInterval(async () => {
      const response = await fetch("/api/admin/fetch", { cache: "no-store" });
      const payload = (await response.json()) as {
        run: FetchRunSummary | null;
        runs: FetchRunSummary[];
      };

      setRun(payload.run);
      setRuns(payload.runs);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [run]);

  return (
    <>
      <section className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-7 p-7 border border-gray-100 bg-white shadow-sm rounded-3xl">
        <div>
          <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">Admin console</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mt-2 text-gray-900">Refresh scrapes, inspect recent runs, and manually fix live price data.</h1>
        </div>
        <ForceFetchButton initialRun={run} onRunChange={setRun} onRunsChange={setRuns} />
      </section>

      <div className="flex flex-col gap-5 p-6 border border-gray-100 bg-white shadow-sm rounded-3xl">
        <div className="flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center">
          <div>
            <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">Latest fetch runs</p>
            <h2 className="text-xl sm:text-2xl font-bold leading-snug mt-1 text-gray-900">Pipeline health</h2>
          </div>
          <Link className="inline-flex items-center justify-center px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors rounded-full" href="/api/cron/daily-fetch">
            Cron endpoint
          </Link>
        </div>
        <div className="flex flex-col gap-4">
          {runs.map((entry) => (
            <article className="flex justify-between gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100 text-sm" key={entry.id}>
              <div>
                <strong>{entry.status}</strong>
                <p>{entry.sourceMode} mode</p>
                {entry.currentMessage ? <p>{entry.currentMessage}</p> : null}
                {entry.errorMessage ? <p className="text-red-600">{entry.errorMessage}</p> : null}
              </div>
              <div className="flex flex-col items-end text-right">
                <span>{entry.itemsFetched} fetched</span>
                <span>{entry.itemsCreated} new / {entry.itemsUpdated} updated</span>
                <span>{entry.progressPercent.toFixed(0)}% progress</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
