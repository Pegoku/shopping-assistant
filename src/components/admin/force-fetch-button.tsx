"use client";

import { useEffect, useMemo, useState } from "react";
import type { FetchRunSummary } from "@/lib/types";

type CategoryOption = {
  label: string;
  path: string;
};

type CategoryPayload = {
  ahCategories: CategoryOption[];
  jumboCategories: CategoryOption[];
};

export function ForceFetchButton({
  initialRun,
  onRunChange,
  onRunsChange,
}: {
  initialRun: FetchRunSummary | null;
  onRunChange?: (run: FetchRunSummary | null) => void;
  onRunsChange?: (runs: FetchRunSummary[]) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [run, setRun] = useState<FetchRunSummary | null>(initialRun);
  const [categories, setCategories] = useState<CategoryPayload | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedAh, setSelectedAh] = useState<string[]>([]);
  const [selectedJumbo, setSelectedJumbo] = useState<string[]>([]);

  useEffect(() => {
    if (!run || run.status !== "PENDING") {
      return;
    }

    const interval = window.setInterval(async () => {
      const response = await fetch("/api/admin/fetch", { cache: "no-store" });
      const payload = (await response.json()) as { run: FetchRunSummary | null; runs: FetchRunSummary[] };
      setRun(payload.run);
      onRunChange?.(payload.run);
      onRunsChange?.(payload.runs);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [onRunChange, onRunsChange, run]);

  async function loadCategories() {
    if (categories || categoriesLoading) {
      return;
    }

    setCategoriesLoading(true);
    try {
      const response = await fetch("/api/admin/fetch/categories", { cache: "no-store" });
      const payload = (await response.json()) as CategoryPayload & { ok: boolean };
      setCategories({ ahCategories: payload.ahCategories, jumboCategories: payload.jumboCategories });
    } finally {
      setCategoriesLoading(false);
    }
  }

  async function onForceFetch() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          ahCategoryPaths: mode === "partial" ? selectedAh : undefined,
          jumboCategoryPaths: mode === "partial" ? selectedJumbo : undefined,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; runId: string; alreadyRunning?: boolean };

      if (!response.ok || !payload.ok) {
        setMessage("Fetch failed to start");
      } else {
        setMessage(payload.alreadyRunning ? "A scrape is already running." : "Fetch started. Live progress updates every second.");
        setRun((current) => {
          const nextRun =
          current && payload.alreadyRunning
            ? current
            : {
                id: payload.runId,
                status: "PENDING",
                sourceMode: "live",
                startedAt: new Date().toISOString(),
                completedAt: null,
                itemsFetched: 0,
                itemsCreated: 0,
                itemsUpdated: 0,
                itemsDiscovered: 0,
                itemsExpected: null,
                pagesProcessed: 0,
                pagesExpected: null,
                categoriesDone: 0,
                categoriesTotal: null,
                currentStore: null,
                currentCategory: null,
                currentMessage: "Queued",
                progressPercent: 0,
                warningCount: 0,
                errorMessage: null,
              };
          onRunChange?.(nextRun);
          return nextRun;
        });
      }
    } catch {
      setMessage("Fetch failed to start");
    } finally {
      setLoading(false);
    }
  }

  const progressWidth = `${Math.max(4, Math.round(run?.progressPercent ?? 0))}%`;
  const isRunning = run?.status === "PENDING";
  const categoryCount = useMemo(
    () => ({ ah: selectedAh.length, jumbo: selectedJumbo.length }),
    [selectedAh.length, selectedJumbo.length],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button
          className={`px-4 py-2 rounded-full ${mode === "full" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}
          onClick={() => setMode("full")}
          type="button"
        >
          Full fetch
        </button>
        <button
          className={`px-4 py-2 rounded-full ${mode === "partial" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}
          onClick={() => {
            setMode("partial");
            void loadCategories();
          }}
          type="button"
        >
          Partial fetch
        </button>
      </div>

      {mode === "partial" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 max-h-80 overflow-hidden">
          <CategoryPicker
            title={`AH categories${categoryCount.ah ? ` (${categoryCount.ah})` : ""}`}
            loading={categoriesLoading}
            options={categories?.ahCategories ?? []}
            selected={selectedAh}
            setSelected={setSelectedAh}
          />
          <CategoryPicker
            title={`Jumbo categories${categoryCount.jumbo ? ` (${categoryCount.jumbo})` : ""}`}
            loading={categoriesLoading}
            options={categories?.jumboCategories ?? []}
            selected={selectedJumbo}
            setSelected={setSelectedJumbo}
          />
        </div>
      ) : null}

      <button
        className="px-4 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={loading || isRunning || (mode === "partial" && selectedAh.length === 0 && selectedJumbo.length === 0)}
        onClick={onForceFetch}
        type="button"
      >
        {isRunning ? "Fetch in progress..." : loading ? "Starting..." : mode === "full" ? "Start full fetch" : "Start partial fetch"}
      </button>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div>
            <strong>{run?.status ?? "IDLE"}</strong>
            <p className="text-gray-500">{run?.currentMessage ?? "No fetch running"}</p>
          </div>
          <div className="text-right text-gray-600">
            <p>{run?.itemsFetched ?? 0} fetched</p>
            <p>{run?.itemsCreated ?? 0} new / {run?.itemsUpdated ?? 0} updated</p>
          </div>
        </div>

        <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: progressWidth }} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-600 sm:grid-cols-4">
          <div>
            <p className="font-medium text-gray-900">Found</p>
            <p>{run?.itemsDiscovered ?? 0}{run?.itemsExpected ? ` / ${run.itemsExpected}` : ""}</p>
          </div>
          <div>
            <p className="font-medium text-gray-900">Pages</p>
            <p>{run?.pagesProcessed ?? 0}{run?.pagesExpected ? ` / ${run.pagesExpected}` : ""}</p>
          </div>
          <div>
            <p className="font-medium text-gray-900">Categories</p>
            <p>{run?.categoriesDone ?? 0}{run?.categoriesTotal ? ` / ${run.categoriesTotal}` : ""}</p>
          </div>
          <div>
            <p className="font-medium text-gray-900">Warnings</p>
            <p>{run?.warningCount ?? 0}</p>
          </div>
        </div>

        {run?.currentStore || run?.currentCategory ? (
          <p className="mt-3 text-sm text-gray-500">
            {run.currentStore ? `${run.currentStore}` : ""}
            {run.currentStore && run.currentCategory ? " - " : ""}
            {run.currentCategory ?? ""}
          </p>
        ) : null}

        {run?.errorMessage ? <p className="mt-2 text-sm text-red-600">{run.errorMessage}</p> : null}
      </div>

      {message ? <p className="text-sm text-gray-600">{message}</p> : null}
    </div>
  );
}

function CategoryPicker({
  title,
  options,
  selected,
  setSelected,
  loading,
}: {
  title: string;
  options: CategoryOption[];
  selected: string[];
  setSelected: (value: string[]) => void;
  loading: boolean;
}) {
  return (
    <div className="min-h-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <button className="text-xs text-gray-500" onClick={() => setSelected(options.map((option) => option.path))} type="button">
          All
        </button>
      </div>
      <div className="max-h-52 overflow-y-auto space-y-2">
        {loading ? <p className="text-sm text-gray-500">Loading categories...</p> : null}
        {options.map((option) => (
          <label className="flex items-start gap-2 text-sm text-gray-700" key={option.path}>
            <input
              checked={selected.includes(option.path)}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, option.path]
                    : selected.filter((path) => path !== option.path),
                )
              }
              type="checkbox"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
