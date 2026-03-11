import Link from "next/link";
import { AdminProductsTable } from "@/components/admin/admin-products-table";
import { ForceFetchButton } from "@/components/admin/force-fetch-button";
import { getFetchRuns, getProducts } from "@/lib/queries";

export default async function AdminPage() {
  const [products, fetchRuns] = await Promise.all([getProducts(), getFetchRuns()]);

  return (
    <div className="page-stack">
      <section className="admin-header-card">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1>Refresh scrapes, inspect recent runs, and manually fix live price data.</h1>
        </div>
        <ForceFetchButton />
      </section>

      <section className="admin-grid">
        <div className="panel-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Latest fetch runs</p>
              <h2>Pipeline health</h2>
            </div>
            <Link className="ghost-button" href="/api/cron/daily-fetch">
              Cron endpoint
            </Link>
          </div>
          <div className="fetch-run-list">
            {fetchRuns.map((run) => (
              <article className="fetch-run-card" key={run.id}>
                <div>
                  <strong>{run.status}</strong>
                  <p>{run.sourceMode} mode</p>
                </div>
                <div>
                  <span>{run.itemsFetched} fetched</span>
                  <span>{run.itemsCreated} new / {run.itemsUpdated} updated</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Product edits</p>
              <h2>Manual overrides</h2>
            </div>
          </div>
          <AdminProductsTable products={products} />
        </div>
      </section>
    </div>
  );
}
