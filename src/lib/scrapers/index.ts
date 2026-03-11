import { FetchStatus } from "@prisma/client";
import { generateGenericNamesBatch } from "@/lib/ai/generic-name";
import { prisma } from "@/lib/db";
import { discoverAlbertHeijnCategories, scrapeAlbertHeijn } from "@/lib/scrapers/ah";
import { discoverJumboCategories, scrapeJumbo } from "@/lib/scrapers/jumbo";
import { scrapeMockStores } from "@/lib/scrapers/mock";
import type { ScrapeProgressEvent, ScrapeResult, ScrapedProduct } from "@/lib/scrapers/types";
import type { CategoryLink } from "@/lib/scrapers/utils";
import { clamp, slugify } from "@/lib/utils";

export type ScrapeJobOptions = {
  mode?: "full" | "partial";
  ahCategoryPaths?: string[];
  jumboCategoryPaths?: string[];
};

type RunProgressState = {
  pagesProcessed: number;
  pagesExpected: number | null;
  categoriesDone: number;
  categoriesTotal: number | null;
  itemsDiscovered: number;
  itemsExpected: number | null;
  currentStore: string | null;
  currentCategory: string | null;
  currentMessage: string | null;
  warningCount: number;
  progressPercent: number;
};

const activeRuns = new Set<string>();

function emptyProgressState(): RunProgressState {
  return {
    pagesProcessed: 0,
    pagesExpected: null,
    categoriesDone: 0,
    categoriesTotal: null,
    itemsDiscovered: 0,
    itemsExpected: null,
    currentStore: null,
    currentCategory: null,
    currentMessage: null,
    warningCount: 0,
    progressPercent: 0,
  };
}

async function updateRunProgress(runId: string, state: RunProgressState) {
  const pagePercent = state.pagesExpected ? state.pagesProcessed / state.pagesExpected : 0;
  const categoryPercent = state.categoriesTotal ? state.categoriesDone / state.categoriesTotal : 0;
  state.progressPercent = clamp(Math.max(pagePercent, categoryPercent) * 100, 0, 99);

  await prisma.fetchRun.update({
    where: { id: runId },
    data: {
      pagesProcessed: state.pagesProcessed,
      pagesExpected: state.pagesExpected,
      categoriesDone: state.categoriesDone,
      categoriesTotal: state.categoriesTotal,
      itemsDiscovered: state.itemsDiscovered,
      itemsExpected: state.itemsExpected,
      currentStore: state.currentStore,
      currentCategory: state.currentCategory,
      currentMessage: state.currentMessage,
      progressPercent: state.progressPercent,
      warningCount: state.warningCount,
    },
  });
}

async function enrichProducts(results: ScrapeResult[], runId: string, progressState: RunProgressState) {
  const unresolvedProducts = results.flatMap((result) => result.products).filter((product) => !product.genericNameEn || !product.genericNameEs);
  console.log(`[AI] Enriching ${unresolvedProducts.length} products with generic names`);
  progressState.currentStore = "AI";
  progressState.currentCategory = null;
  progressState.currentMessage = `AI enrichment for ${unresolvedProducts.length} products`;
  await updateRunProgress(runId, progressState);

  const names = await generateGenericNamesBatch(unresolvedProducts.map((product) => product.originalName));

  for (const product of unresolvedProducts) {
    const enriched = names.get(product.originalName);

    if (enriched) {
      product.genericNameEn = enriched.english;
      product.genericNameEs = enriched.spanish;
    }
  }
}

async function upsertProduct(product: ScrapedProduct) {
  const names = {
    english: product.genericNameEn ?? product.originalName.toLowerCase(),
    spanish: product.genericNameEs ?? product.originalName.toLowerCase(),
  };

  const existing = await prisma.product.findFirst({
    where: {
      supermarket: product.supermarket,
      OR: [
        ...(product.sourceUrl ? [{ sourceUrl: product.sourceUrl }] : []),
        {
          originalName: product.originalName,
          quantityText: product.quantityText,
        },
      ],
    },
    include: {
      categories: {
        include: {
          category: true,
        },
      },
    },
  });

  const mergedCategoryLabels = Array.from(
    new Set([...(existing?.categories.map((entry) => entry.category.label) ?? []), ...(product.categories ?? [])]),
  );

  const categoryRecords = mergedCategoryLabels.length
    ? await Promise.all(
        mergedCategoryLabels.map((label) =>
          prisma.category.upsert({
            where: { slug: slugify(label) },
            update: { label },
            create: { slug: slugify(label), label },
          }),
        ),
      )
    : [];

  if (!existing) {
    const created = await prisma.product.create({
      data: {
        supermarket: product.supermarket,
        originalName: product.originalName,
        genericNameEn: names.english,
        genericNameEs: names.spanish,
        quantityText: product.quantityText,
        unitAmount: product.unitAmount,
        normalizedUnit: product.normalizedUnit,
        currentPrice: product.currentPrice,
        currentUnitPrice: product.currentUnitPrice,
        imageUrl: product.imageUrl,
        sourceUrl: product.sourceUrl,
        dealText: product.dealText,
        isDealActive: Boolean(product.isDealActive),
        lastFetchedAt: new Date(),
        categories: categoryRecords.length
          ? {
              create: categoryRecords.map((category) => ({ categoryId: category.id })),
            }
          : undefined,
      },
    });

    await prisma.priceHistory.create({
      data: {
        productId: created.id,
        price: product.currentPrice,
        unitPrice: product.currentUnitPrice,
        isDeal: Boolean(product.isDealActive),
        dealText: product.dealText,
      },
    });

    return { created: 1, updated: 0 };
  }

  await prisma.product.update({
    where: { id: existing.id },
    data: {
      genericNameEn: names.english,
      genericNameEs: names.spanish,
      currentPrice: product.currentPrice,
      currentUnitPrice: product.currentUnitPrice,
      quantityText: product.quantityText,
      unitAmount: product.unitAmount,
      normalizedUnit: product.normalizedUnit,
      imageUrl: product.imageUrl,
      sourceUrl: product.sourceUrl,
      dealText: product.dealText,
      isDealActive: Boolean(product.isDealActive),
      lastFetchedAt: new Date(),
      categories: categoryRecords.length
        ? {
            deleteMany: {},
            create: categoryRecords.map((category) => ({ categoryId: category.id })),
          }
        : undefined,
    },
  });

  await prisma.priceHistory.create({
    data: {
      productId: existing.id,
      price: product.currentPrice,
      unitPrice: product.currentUnitPrice,
      isDeal: Boolean(product.isDealActive),
      dealText: product.dealText,
    },
  });

  return { created: 0, updated: 1 };
}

async function getScrapeResults(
  reportProgress: (event: ScrapeProgressEvent) => Promise<void>,
  options?: ScrapeJobOptions,
) {
  if (process.env.SCRAPER_MODE !== "live") {
    return {
      results: await scrapeMockStores(),
      hadWarnings: false,
    };
  }

  const settled = await Promise.allSettled([
    scrapeAlbertHeijn(reportProgress, options?.mode === "partial" ? options.ahCategoryPaths : undefined),
    scrapeJumbo(reportProgress, options?.mode === "partial" ? options.jumboCategoryPaths : undefined),
  ]);
  const results: ScrapeResult[] = [];
  let hadWarnings = false;

  for (const entry of settled) {
    if (entry.status === "fulfilled") {
      results.push(entry.value);
      continue;
    }

    hadWarnings = true;
    const message = entry.reason instanceof Error ? entry.reason.message : "Unknown scraper failure";
    console.error(`[SCRAPE] Store scraper failed: ${message}`);
    await reportProgress({ message: `Store scraper failed: ${message}`, warning: true });
  }

  return { results, hadWarnings };
}

export async function createScrapeRun(sourceMode = process.env.SCRAPER_MODE ?? "mock") {
  const existing = await prisma.fetchRun.findFirst({
    where: {
      status: FetchStatus.PENDING,
      completedAt: null,
    },
    orderBy: {
      startedAt: "desc",
    },
  });

  if (existing) {
    return { runId: existing.id, alreadyRunning: true };
  }

  const run = await prisma.fetchRun.create({
    data: {
      status: FetchStatus.PENDING,
      sourceMode,
      currentMessage: "Queued",
    },
  });

  return { runId: run.id, alreadyRunning: false };
}

export function startConfiguredScrapeRunInBackground(runId: string, options?: ScrapeJobOptions) {
  if (activeRuns.has(runId)) {
    return;
  }

  activeRuns.add(runId);
  setTimeout(() => {
    void runScrapeJob(runId, options).finally(() => {
      activeRuns.delete(runId);
    });
  }, 0);
}

export async function runScrapeJob(runId: string, options?: ScrapeJobOptions) {
  const sourceMode = process.env.SCRAPER_MODE ?? "mock";
  console.log(`[SCRAPE] Starting job ${runId} in ${sourceMode} mode`);
  const progressState = emptyProgressState();
  let hadWarnings = false;

  const reportProgress = async (event: ScrapeProgressEvent) => {
    progressState.currentStore = event.store ?? progressState.currentStore;
    progressState.currentCategory = event.category ?? progressState.currentCategory;
    progressState.currentMessage = event.message;
    progressState.pagesProcessed += event.pagesProcessed ?? 0;
    progressState.pagesExpected = event.pagesExpected ?? progressState.pagesExpected;
    progressState.categoriesDone = event.categoriesDone ?? progressState.categoriesDone;
    progressState.categoriesTotal = event.categoriesTotal ?? progressState.categoriesTotal;
    progressState.itemsDiscovered += event.itemsDiscovered ?? 0;
    progressState.itemsExpected = event.itemsExpected ?? progressState.itemsExpected;

    if (event.warning) {
      progressState.warningCount += 1;
      hadWarnings = true;
    }

    await updateRunProgress(runId, progressState);
  };

  try {
    await prisma.fetchRun.update({
      where: { id: runId },
      data: {
        status: FetchStatus.PENDING,
        sourceMode,
        currentMessage: options?.mode === "partial" ? "Starting partial scrape" : "Starting full scrape",
      },
    });

    const { results, hadWarnings: scraperWarnings } = await getScrapeResults(reportProgress, options);
    hadWarnings = hadWarnings || scraperWarnings;
    console.log(`[SCRAPE] Raw results -> ${results.map((result) => `${result.supermarket}:${result.products.length}`).join(", ")}`);

    await enrichProducts(results, runId, progressState);

    let itemsFetched = 0;
    let itemsCreated = 0;
    let itemsUpdated = 0;

    for (const result of results) {
      progressState.currentStore = result.supermarket;
      progressState.currentCategory = null;
      progressState.currentMessage = `Persisting ${result.products.length} ${result.supermarket} products`;
      await updateRunProgress(runId, progressState);

      for (const product of result.products) {
        const summary = await upsertProduct(product);
        itemsFetched += 1;
        itemsCreated += summary.created;
        itemsUpdated += summary.updated;

        if (itemsFetched % 25 === 0) {
          await prisma.fetchRun.update({
            where: { id: runId },
            data: {
              itemsFetched,
              itemsCreated,
              itemsUpdated,
              currentStore: result.supermarket,
              currentMessage: `Persisted ${itemsFetched} products`,
            },
          });
        }
      }
    }

    await prisma.fetchRun.update({
      where: { id: runId },
      data: {
        status: hadWarnings ? FetchStatus.PARTIAL : FetchStatus.SUCCESS,
        itemsFetched,
        itemsCreated,
        itemsUpdated,
        itemsDiscovered: progressState.itemsDiscovered,
        itemsExpected: progressState.itemsExpected,
        pagesProcessed: progressState.pagesProcessed,
        pagesExpected: progressState.pagesExpected,
        categoriesDone: progressState.categoriesDone,
        categoriesTotal: progressState.categoriesTotal,
        currentStore: null,
        currentCategory: null,
        currentMessage: hadWarnings ? "Completed with warnings" : "Completed successfully",
        progressPercent: 100,
        warningCount: progressState.warningCount,
        completedAt: new Date(),
      },
    });

    return {
      ok: true,
      runId,
      itemsFetched,
      itemsCreated,
      itemsUpdated,
      sourceMode,
      partial: hadWarnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scrape failure";
    console.error(`[SCRAPE] Job failed: ${message}`);
    await prisma.fetchRun.update({
      where: { id: runId },
      data: {
        status: FetchStatus.FAILED,
        errorMessage: message,
        currentMessage: message,
        itemsDiscovered: progressState.itemsDiscovered,
        itemsExpected: progressState.itemsExpected,
        pagesProcessed: progressState.pagesProcessed,
        pagesExpected: progressState.pagesExpected,
        categoriesDone: progressState.categoriesDone,
        categoriesTotal: progressState.categoriesTotal,
        currentStore: progressState.currentStore,
        currentCategory: progressState.currentCategory,
        progressPercent: progressState.progressPercent,
        warningCount: progressState.warningCount,
        completedAt: new Date(),
      },
    });

    return {
      ok: false,
      runId,
      error: message,
      sourceMode,
    };
  }
}

export async function getAvailableScrapeCategories(): Promise<{
  ahCategories: CategoryLink[];
  jumboCategories: CategoryLink[];
}> {
  const [ahCategories, jumboCategories] = await Promise.all([discoverAlbertHeijnCategories(), discoverJumboCategories()]);
  return { ahCategories, jumboCategories };
}
