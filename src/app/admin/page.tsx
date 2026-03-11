import Link from "next/link";
import { AdminProductsTable } from "@/components/admin/admin-products-table";
import { ForceFetchButton } from "@/components/admin/force-fetch-button";
import { getFetchRuns, getLatestFetchRun, getProducts } from "@/lib/queries";

export default async function AdminPage() {
  const [products, fetchRuns, latestRun] = await Promise.all([getProducts(), getFetchRuns(), getLatestFetchRun()]);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-7 p-7 border border-gray-100 bg-white shadow-sm rounded-3xl">
        <div>
          <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">Admin console</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mt-2 text-gray-900">Refresh scrapes, inspect recent runs, and manually fix live price data.</h1>
        </div>
        <ForceFetchButton initialRun={latestRun} />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
            {fetchRuns.map((run) => (
              <article className="flex justify-between p-4 rounded-xl bg-gray-50 border border-gray-100 text-sm" key={run.id}>
                <div>
                  <strong>{run.status}</strong>
                  <p>{run.sourceMode} mode</p>
                  {run.currentMessage ? <p>{run.currentMessage}</p> : null}
                </div>
                <div>
                  <span>{run.itemsFetched} fetched</span>
                  <span>{run.itemsCreated} new / {run.itemsUpdated} updated</span>
                  <span>{run.progressPercent.toFixed(0)}% progress</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-5 p-6 border border-gray-100 bg-white shadow-sm rounded-3xl">
          <div className="flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center">
            <div>
              <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">Product edits</p>
              <h2 className="text-xl sm:text-2xl font-bold leading-snug mt-1 text-gray-900">Manual overrides</h2>
            </div>
          </div>
          <AdminProductsTable products={products} />
        </div>
      </section>
    </div>
  );
}
