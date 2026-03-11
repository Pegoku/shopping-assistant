import { FetchStatus } from "@prisma/client";
import { generateGenericNamesBatch } from "@/lib/ai/generic-name";
import { prisma } from "@/lib/db";
import { scrapeAlbertHeijn } from "@/lib/scrapers/ah";
import { scrapeJumbo } from "@/lib/scrapers/jumbo";
import { scrapeMockStores } from "@/lib/scrapers/mock";
import type { ScrapeResult, ScrapedProduct } from "@/lib/scrapers/types";
import { slugify } from "@/lib/utils";

async function enrichProducts(results: ScrapeResult[]) {
  const unresolvedProducts = results.flatMap((result) => result.products).filter((product) => !product.genericNameEn || !product.genericNameEs);
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
        ...(product.sourceUrl
          ? [
              {
                sourceUrl: product.sourceUrl,
              },
            ]
          : []),
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
    new Set([
      ...(existing?.categories.map((entry) => entry.category.label) ?? []),
      ...(product.categories ?? []),
    ]),
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

async function getScrapeResults(): Promise<ScrapeResult[]> {
  if (process.env.SCRAPER_MODE === "live") {
    const [ah, jumbo] = await Promise.all([scrapeAlbertHeijn(), scrapeJumbo()]);
    return [ah, jumbo];
  }

  return scrapeMockStores();
}

export async function runScrapeJob() {
  const sourceMode = process.env.SCRAPER_MODE ?? "mock";
  const run = await prisma.fetchRun.create({
    data: {
      status: FetchStatus.PENDING,
      sourceMode,
    },
  });

  try {
    const results = await getScrapeResults();
    await enrichProducts(results);
    let itemsFetched = 0;
    let itemsCreated = 0;
    let itemsUpdated = 0;

    for (const result of results) {
      for (const product of result.products) {
        const summary = await upsertProduct(product);
        itemsFetched += 1;
        itemsCreated += summary.created;
        itemsUpdated += summary.updated;
      }
    }

    await prisma.fetchRun.update({
      where: { id: run.id },
      data: {
        status: FetchStatus.SUCCESS,
        itemsFetched,
        itemsCreated,
        itemsUpdated,
        completedAt: new Date(),
      },
    });

    return {
      ok: true,
      runId: run.id,
      itemsFetched,
      itemsCreated,
      itemsUpdated,
      sourceMode,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scrape failure";

    await prisma.fetchRun.update({
      where: { id: run.id },
      data: {
        status: FetchStatus.FAILED,
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    return {
      ok: false,
      runId: run.id,
      error: message,
      sourceMode,
    };
  }
}
