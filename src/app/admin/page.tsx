import Link from "next/link";
import { AdminLivePanel } from "@/components/admin/admin-live-panel";
import { AdminProductsTable } from "@/components/admin/admin-products-table";
import { getFetchRuns, getLatestFetchRun, getProducts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [products, fetchRuns, latestRun] = await Promise.all([getProducts(), getFetchRuns(), getLatestFetchRun()]);

  return (
    <div className="flex flex-col gap-6">
      <AdminLivePanel initialRun={latestRun} initialRuns={fetchRuns} />

      <section className="grid grid-cols-1 gap-5">
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
