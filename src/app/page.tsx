import { ProductGrid } from "@/components/product/product-grid";
import { getProducts } from "@/lib/queries";

export default async function HomePage() {
  const products = await getProducts();

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Daily grocery intelligence</p>
          <h1>Compare AH and Jumbo prices with bilingual search, deal tracking, and trend-aware cards.</h1>
        </div>
        <div className="hero-metrics">
          <div>
            <span>Products tracked</span>
            <strong>{products.length}</strong>
          </div>
          <div>
            <span>Trend badges</span>
            <strong>DoD + WoW</strong>
          </div>
          <div>
            <span>View mode</span>
            <strong>Cards</strong>
          </div>
        </div>
      </section>

      <ProductGrid products={products} />
    </div>
  );
}
