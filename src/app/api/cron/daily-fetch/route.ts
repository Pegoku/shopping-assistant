import { NextResponse } from "next/server";
import { runScrapeJob } from "@/lib/scrapers";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await runScrapeJob();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
