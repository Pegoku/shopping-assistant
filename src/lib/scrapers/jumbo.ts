import { chromium } from "playwright";
import { Supermarket } from "@prisma/client";
import type { ScrapeResult } from "@/lib/scrapers/types";

export async function scrapeJumbo(): Promise<ScrapeResult> {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto("https://www.jumbo.com/", { waitUntil: "domcontentloaded" });

    return {
      supermarket: Supermarket.JUMBO,
      products: [],
    };
  } finally {
    await browser.close();
  }
}
