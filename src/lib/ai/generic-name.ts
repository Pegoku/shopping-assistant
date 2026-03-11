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

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: {
        type: "json_object",
      },
    }),
  });

  if (!response.ok) {
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
    return null;
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function generateGenericNames(originalName: string): Promise<GenericNames> {
  const parsed = await callAi<Partial<GenericNames>>([
    {
      role: "system",
      content:
        "Return compact JSON with keys english and spanish. Normalize grocery product names to short generic nouns for shopping search.",
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

export async function generateGenericNamesBatch(originalNames: string[]) {
  const uniqueNames = Array.from(new Set(originalNames.map((name) => name.trim()).filter(Boolean)));

  if (!uniqueNames.length) {
    return new Map<string, GenericNames>();
  }

  const batchSize = Number(process.env.AI_ENRICHMENT_BATCH_SIZE ?? 30);
  const results = new Map<string, GenericNames>();

  for (let index = 0; index < uniqueNames.length; index += batchSize) {
    const batch = uniqueNames.slice(index, index + batchSize);
    const prompt = batch.map((name, itemIndex) => `${itemIndex + 1}. ${name}`).join("\n");
    const parsed = await callAi<{
      items?: Array<{
        originalName?: string;
        english?: string;
        spanish?: string;
      }>;
    }>([
      {
        role: "system",
        content:
          "You normalize grocery product names. Return JSON with an items array. Each item must include originalName, english, and spanish. english and spanish should be short generic grocery names useful for search, not full marketing titles.",
      },
      {
        role: "user",
        content: `Normalize these grocery product names:\n${prompt}`,
      },
    ]);

    const parsedItems = parsed?.items ?? [];

    for (const name of batch) {
      const found = parsedItems.find((item) => item.originalName?.trim() === name);
      results.set(name, {
        english: found?.english?.trim().toLowerCase() || fallbackNames(name).english,
        spanish: found?.spanish?.trim().toLowerCase() || fallbackNames(name).spanish,
      });
    }
  }

  return results;
}
