import { prisma } from "@/lib/db";

type GenericNames = {
  english: string;
  spanish: string;
};

function createFallbackName(originalName: string) {
  return originalName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const fallbackNames = (originalName: string): GenericNames => ({
  english: createFallbackName(originalName),
  spanish: createFallbackName(originalName),
});

async function callAi<T>(messages: Array<{ role: "system" | "user"; content: string }>): Promise<T | null> {
  const apiKey = process.env.HACKCLUB_AI_API_KEY;
  const baseUrl = process.env.HACKCLUB_AI_BASE_URL;
  const model = process.env.HACKCLUB_AI_MODEL;

  if (!apiKey || !baseUrl || !model) {
    return null;
  }

  const retries = Math.max(1, Number(process.env.AI_ENRICHMENT_RETRIES ?? 2));

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: 900,
        response_format: {
          type: "json_object",
        },
      }),
    });

    if (!response.ok) {
      if (attempt < retries) {
        continue;
      }
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      if (attempt < retries) {
        continue;
      }
      return null;
    }

    try {
      return JSON.parse(content) as T;
    } catch {
      if (attempt === retries) {
        return null;
      }
    }
  }

  return null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));

  return results;
}

async function requestBatchNames(batch: string[]) {
  const prompt = batch.map((name, itemIndex) => `${itemIndex + 1}. ${name}`).join("\n");
  return callAi<{
    items?: Array<{
      originalName?: string;
      english?: string;
      spanish?: string;
    }>;
  }>([
    {
      role: "system",
      content:
        "You normalize grocery product names. Return JSON with an items array. Each item must include originalName, english, and spanish. english and spanish must be short labels useful for shopping search, not full marketing titles. No reasoning, no explanation, no extra keys.",
    },
    {
      role: "user",
      content: `Normalize these grocery product names:\n${prompt}`,
    },
  ]);
}

export async function generateGenericNames(originalName: string): Promise<GenericNames> {
  const parsed = await callAi<Partial<GenericNames>>([
    {
      role: "system",
      content:
        "Return compact JSON with keys english and spanish. Normalize grocery product names to short generic nouns for shopping search. Eg. AH Aardappel ovenschaal patatas bravas should return { english: 'Brava Potatoes', spanish: 'Patatas Bravas' }; ah baby avocado eetrijp should return { english: 'Baby Avocado', spanish: 'Aguacate Bebé' }. Only return the JSON, no explanations.",
    },
    {
      role: "user",
      content: `Original product name: ${originalName}`,
    },
  ]);

  if (!parsed) {
    return fallbackNames(originalName);
  }

  return {
    english: parsed.english?.trim().toLowerCase() || fallbackNames(originalName).english,
    spanish: parsed.spanish?.trim().toLowerCase() || fallbackNames(originalName).spanish,
  };
}

export async function generateGenericNamesBatch(
  originalNames: string[],
  onProgress?: (progress: {
    totalProducts: number;
    totalNames: number;
    processedNames: number;
    cachedNames: number;
    uncachedNames: number;
    batchIndex: number;
    totalBatches: number;
    batchSize: number;
  }) => Promise<void> | void,
) {
  const uniqueNames = Array.from(new Set(originalNames.map((name) => name.trim()).filter(Boolean)));

  if (!uniqueNames.length) {
    return new Map<string, GenericNames>();
  }

  const cachedRows = await prisma.aiNameCache.findMany({
    where: {
      originalName: {
        in: uniqueNames,
      },
    },
  });

  const results = new Map<string, GenericNames>(
    cachedRows.map((row: { originalName: string; genericNameEn: string; genericNameEs: string }) => [
      row.originalName,
      {
        english: row.genericNameEn,
        spanish: row.genericNameEs,
      },
    ]),
  );
  const uncachedNames = uniqueNames.filter((name) => !results.has(name));

  if (!uncachedNames.length) {
    await onProgress?.({
      totalProducts: originalNames.length,
      totalNames: uniqueNames.length,
      processedNames: uniqueNames.length,
      cachedNames: cachedRows.length,
      uncachedNames: 0,
      batchIndex: 0,
      totalBatches: 0,
      batchSize: 0,
    });
    return results;
  }

  const batchSize = Number(process.env.AI_ENRICHMENT_BATCH_SIZE ?? 50);
  const concurrency = Math.max(1, Number(process.env.AI_ENRICHMENT_CONCURRENCY ?? 4));
  const batches = Array.from({ length: Math.ceil(uncachedNames.length / batchSize) }, (_, index) => ({
    batch: uncachedNames.slice(index * batchSize, index * batchSize + batchSize),
    batchIndex: index + 1,
  }));
  const totalBatches = batches.length;
  let processedNames = cachedRows.length;

  const batchResults = await mapWithConcurrency(batches, concurrency, async ({ batch, batchIndex }) => {
    await onProgress?.({
      totalProducts: originalNames.length,
      totalNames: uniqueNames.length,
      processedNames,
      cachedNames: cachedRows.length,
      uncachedNames: uncachedNames.length,
      batchIndex,
      totalBatches,
      batchSize: batch.length,
    });

    let parsed = await requestBatchNames(batch);

    if ((parsed?.items?.length ?? 0) === 0 && batch.length > 0) {
      console.warn(`[AI] Empty output for batch ${batchIndex}/${totalBatches}, retrying once`);
      parsed = await requestBatchNames(batch);
    }

    console.log(`[AI] Batch ${batchIndex}/${totalBatches} raw output: ${JSON.stringify(parsed?.items ?? [])}`);

    const parsedItems = parsed?.items ?? [];
    const mapped = new Map<string, GenericNames>();
    const cacheWrites: Array<{ originalName: string; genericNameEn: string; genericNameEs: string }> = [];

    for (const name of batch) {
      const found = parsedItems.find((item) => item.originalName?.trim() === name);
      const genericNames = {
        english: found?.english?.trim().toLowerCase() || fallbackNames(name).english,
        spanish: found?.spanish?.trim().toLowerCase() || fallbackNames(name).spanish,
      };
      mapped.set(name, genericNames);
      cacheWrites.push({
        originalName: name,
        genericNameEn: genericNames.english,
        genericNameEs: genericNames.spanish,
      });
    }

    await prisma.$transaction(
      cacheWrites.map((entry) =>
        prisma.aiNameCache.upsert({
          where: { originalName: entry.originalName },
          update: {
            genericNameEn: entry.genericNameEn,
            genericNameEs: entry.genericNameEs,
          },
          create: entry,
        }),
      ),
    );

    processedNames += batch.length;
    await onProgress?.({
      totalProducts: originalNames.length,
      totalNames: uniqueNames.length,
      processedNames: Math.min(processedNames, uniqueNames.length),
      cachedNames: cachedRows.length,
      uncachedNames: uncachedNames.length,
      batchIndex,
      totalBatches,
      batchSize: batch.length,
    });

    return mapped;
  });

  for (const batchResult of batchResults) {
    for (const [name, genericNames] of batchResult.entries()) {
      results.set(name, genericNames);
    }
  }

  return results;
}
