import { NextResponse } from "next/server";
import { runScrapeJob } from "@/lib/scrapers";

export async function POST() {
  const result = await runScrapeJob();

  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
  });
}
