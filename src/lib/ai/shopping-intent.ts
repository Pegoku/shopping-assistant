import type { RequestedItem } from "@/lib/types";

type ParsedItemsResponse = {
  items?: Array<{
    originalText?: string | null;
    normalizedEn?: string | null;
    normalizedEs?: string | null;
  }>;
};

function splitFallback(text: string) {
  return text
    .split(/[\n,;]+|\b(?:and|y|e|with|con)\b/gi)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);
}

async function callAi(messages: Array<{ role: "system" | "user"; content: string }>) {
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
      temperature: 0,
      max_tokens: 900,
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
    return JSON.parse(content) as ParsedItemsResponse;
  } catch {
    return null;
  }
}

export async function parseShoppingRequest(text: string): Promise<RequestedItem[]> {
  const fallbackItems = splitFallback(text).map((item) => ({
    originalText: item,
    normalizedEn: item.toLowerCase(),
    normalizedEs: item.toLowerCase(),
  }));

  const parsed = await callAi([
    {
      role: "system",
      content:
        "Extract grocery shopping items from the user's natural-language request. Return JSON with an items array. Each item must have originalText, normalizedEn, normalizedEs. Keep them short and generic for grocery matching. No reasoning, no extra keys.",
    },
    {
      role: "user",
      content: text,
    },
  ]);

  const cleaned = (parsed?.items ?? [])
    .filter((item) => item.originalText && (item.normalizedEn || item.normalizedEs))
    .map((item) => ({
      originalText: item.originalText!.trim(),
      normalizedEn: item.normalizedEn?.trim().toLowerCase() || item.originalText!.trim().toLowerCase(),
      normalizedEs: item.normalizedEs?.trim().toLowerCase() || item.originalText!.trim().toLowerCase(),
    }));

  return cleaned.length ? cleaned : fallbackItems;
}
