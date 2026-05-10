import { Supermarket } from "@prisma/client";
import { NextResponse } from "next/server";
import { matchReceiptItems } from "@/lib/past-orders";

type AiReceiptResponse = {
  supermarket?: "AH" | "JUMBO" | null;
  orderedAt?: string | null;
  total?: number | null;
  rawReceiptText?: string | null;
  notes?: string | null;
  items?: Array<{
    receiptName?: string | null;
    quantity?: number | null;
    unitPrice?: number | null;
    totalPrice?: number | null;
    dealText?: string | null;
  }>;
};

async function fileToDataUrl(receiptFile: File) {
  const buffer = Buffer.from(await receiptFile.arrayBuffer());
  const contentType = receiptFile.type || (receiptFile.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function callReceiptAi(receiptFiles: File[], supermarket: Supermarket) {
  const apiKey = process.env.HACKCLUB_AI_API_KEY;
  const baseUrl = process.env.HACKCLUB_AI_BASE_URL;
  const model = process.env.HACKCLUB_AI_RECEIPT_MODEL ?? "google/gemini-3.1-flash-lite";

  if (!apiKey || !baseUrl) {
    throw new Error("Missing HACKCLUB_AI_API_KEY or HACKCLUB_AI_BASE_URL");
  }

  const dataUrls = await Promise.all(receiptFiles.map(fileToDataUrl));
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1800,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You read Dutch grocery receipts. Return strict JSON only with supermarket, orderedAt, total, rawReceiptText, notes, and items. items must include receiptName, quantity, unitPrice, totalPrice, and optional dealText when a visible deal/discount applies. Keep receiptName exactly as printed/codenamed. Use null when unsure. Do not invent items.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Scan these ${supermarket} receipt file(s) as one order. They may be images or PDFs, including pages from the same receipt. The selected supermarket is authoritative; do not match products from another supermarket.`,
            },
            ...dataUrls.map((dataUrl) => ({
              type: "image_url",
              image_url: { url: dataUrl },
            })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Receipt AI failed with ${response.status}`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Receipt AI returned no content");
  }

  return JSON.parse(content) as AiReceiptResponse;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const selectedStore = formData.get("supermarket");
  const receiptFiles = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  const legacyReceiptFile = formData.get("image");

  if (legacyReceiptFile instanceof File) {
    receiptFiles.push(legacyReceiptFile);
  }

  if (selectedStore !== "AH" && selectedStore !== "JUMBO") {
    return NextResponse.json({ error: "Choose AH or JUMBO before scanning" }, { status: 400 });
  }

  if (!receiptFiles.length) {
    return NextResponse.json({ error: "Missing receipt image or PDF" }, { status: 400 });
  }

  const supportedType = receiptFiles.every((receiptFile) => receiptFile.type.startsWith("image/") || receiptFile.type === "application/pdf" || receiptFile.name.toLowerCase().endsWith(".pdf"));

  if (!supportedType) {
    return NextResponse.json({ error: "Receipt must be an image or PDF" }, { status: 400 });
  }

  try {
    const parsed = await callReceiptAi(receiptFiles, selectedStore as Supermarket);
    const items = (parsed.items ?? [])
      .map((item) => ({
        receiptName: item.receiptName?.trim() ?? "",
        quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1,
        unitPrice: typeof item.unitPrice === "number" ? item.unitPrice : null,
        totalPrice: typeof item.totalPrice === "number" ? item.totalPrice : 0,
        dealText: item.dealText?.trim() || null,
      }))
      .filter((item) => item.receiptName && item.totalPrice >= 0);
    const matchedItems = await matchReceiptItems(selectedStore as Supermarket, items);

    return NextResponse.json({
      result: {
        supermarket: selectedStore,
        orderedAt: parsed.orderedAt ?? null,
        total: typeof parsed.total === "number" ? parsed.total : matchedItems.reduce((sum, item) => sum + item.totalPrice, 0),
        rawReceiptText: parsed.rawReceiptText ?? null,
        receiptImageName: receiptFiles.map((file) => file.name).join(", "),
        items: matchedItems,
        notes: parsed.notes ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to scan receipt" }, { status: 500 });
  }
}
