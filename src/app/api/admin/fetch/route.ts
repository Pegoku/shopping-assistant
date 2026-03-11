import { NextResponse } from "next/server";
import { getLatestFetchRun } from "@/lib/queries";
import { createScrapeRun, startConfiguredScrapeRunInBackground } from "@/lib/scrapers";

type FetchRequestBody = {
  mode?: "full" | "partial";
  ahCategoryPaths?: string[];
  jumboCategoryPaths?: string[];
};

export async function GET() {
  const run = await getLatestFetchRun();
  return NextResponse.json({ ok: true, run });
}

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => ({}))) as FetchRequestBody) ?? {};
  const mode = body.mode ?? "full";
  const sourceMode = process.env.SCRAPER_MODE ?? "mock";
  const { runId, alreadyRunning } = await createScrapeRun(sourceMode);

  if (!alreadyRunning) {
    startConfiguredScrapeRunInBackground(runId, {
      mode,
      ahCategoryPaths: body.ahCategoryPaths,
      jumboCategoryPaths: body.jumboCategoryPaths,
    });
  }

  return NextResponse.json({
    ok: true,
    runId,
    alreadyRunning,
    mode,
    sourceMode,
  });
}
