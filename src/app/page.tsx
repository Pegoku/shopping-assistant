import { ProductGrid } from "@/components/product/product-grid";
import { getProducts } from "@/lib/queries";

export default async function HomePage() {
  const products = await getProducts();

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-7 p-7 border border-gray-100 bg-white shadow-sm rounded-3xl">
        <div>
          <p className="text-xs tracking-wide uppercase text-gray-500 font-medium">Daily grocery intelligence</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mt-2 text-gray-900">Compare AH and Jumbo prices with bilingual search, deal tracking, and trend-aware cards.</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
