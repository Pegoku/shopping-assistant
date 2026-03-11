type GenericNames = {
  english: string;
  spanish: string;
};

const fallbackNames = (originalName: string): GenericNames => ({
  english: originalName.trim().toLowerCase(),
  spanish: originalName.trim().toLowerCase(),
});

export async function generateGenericNames(originalName: string): Promise<GenericNames> {
  const apiKey = process.env.HACKCLUB_AI_API_KEY;
  const baseUrl = process.env.HACKCLUB_AI_BASE_URL;
  const model = process.env.HACKCLUB_AI_MODEL;

  if (!apiKey || !baseUrl || !model) {
    return fallbackNames(originalName);
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "Return compact JSON with keys english and spanish. Normalize grocery product names to short generic nouns for shopping search.",
        },
        {
          role: "user",
          content: `Original product name: ${originalName}`,
        },
      ],
      response_format: {
        type: "json_object",
      },
    }),
  });

  if (!response.ok) {
    return fallbackNames(originalName);
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
    return fallbackNames(originalName);
  }

  try {
    const parsed = JSON.parse(content) as Partial<GenericNames>;

    return {
      english: parsed.english?.trim().toLowerCase() || fallbackNames(originalName).english,
      spanish: parsed.spanish?.trim().toLowerCase() || fallbackNames(originalName).spanish,
    };
  } catch {
    return fallbackNames(originalName);
  }
}
