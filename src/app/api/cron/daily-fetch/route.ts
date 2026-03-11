import { NextResponse } from "next/server";
import { createScrapeRun, runScrapeJob } from "@/lib/scrapers";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await createScrapeRun(process.env.SCRAPER_MODE ?? "mock");
  const result = await runScrapeJob(runId, { mode: "full" });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
