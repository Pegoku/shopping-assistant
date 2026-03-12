import { NextResponse } from "next/server";
import { getProducts } from "@/lib/queries";
import type { ProductQueryInput, ProductSortMode } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const input: ProductQueryInput = {
    search: searchParams.get("search") ?? undefined,
    sort: (searchParams.get("sort") as ProductSortMode | null) ?? undefined,
    supermarket: (searchParams.get("supermarket") as "all" | "AH" | "JUMBO" | null) ?? undefined,
    dealsOnly: searchParams.get("dealsOnly") === "true",
    offset: searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
  };

  const result = await getProducts(input);
  return NextResponse.json(result);
}
