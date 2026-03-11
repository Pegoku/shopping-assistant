import { NextResponse } from "next/server";
import { getAvailableScrapeCategories } from "@/lib/scrapers";

export async function GET() {
  const categories = await getAvailableScrapeCategories();
  return NextResponse.json({ ok: true, ...categories });
}
