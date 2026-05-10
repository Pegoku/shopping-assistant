import { PastOrderSource, Supermarket } from "@prisma/client";
import { NextResponse } from "next/server";
import { createPastOrder, listPastOrders } from "@/lib/past-orders";

type OrderBody = {
  supermarket?: "AH" | "JUMBO";
  source?: "MANUAL" | "AI_RECEIPT" | "WHATSAPP";
  orderedAt?: string | null;
  payerId?: string | null;
  participantIds?: string[];
  total?: number | null;
  rawReceiptText?: string | null;
  receiptImageName?: string | null;
  items?: Array<{
    receiptName?: string;
    quantity?: number;
    unitPrice?: number | null;
    totalPrice?: number;
    productId?: string | null;
    aiConfidence?: number | null;
  }>;
};

export async function GET() {
  return NextResponse.json({ orders: await listPastOrders() });
}

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => ({}))) as OrderBody) ?? {};

  if (!body.supermarket || !Object.values(Supermarket).includes(body.supermarket as Supermarket)) {
    return NextResponse.json({ error: "Missing or invalid supermarket" }, { status: 400 });
  }

  const items = (body.items ?? [])
    .map((item) => ({
      receiptName: item.receiptName?.trim() ?? "",
      quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1,
      unitPrice: typeof item.unitPrice === "number" ? item.unitPrice : null,
      totalPrice: typeof item.totalPrice === "number" ? item.totalPrice : 0,
      productId: item.productId ?? null,
      aiConfidence: typeof item.aiConfidence === "number" ? item.aiConfidence : null,
    }))
    .filter((item) => item.receiptName && item.totalPrice >= 0);

  if (!items.length) {
    return NextResponse.json({ error: "Add at least one order item" }, { status: 400 });
  }

  const order = await createPastOrder({
    supermarket: body.supermarket as Supermarket,
    source: body.source ? (body.source as PastOrderSource) : PastOrderSource.MANUAL,
    orderedAt: body.orderedAt,
    payerId: body.payerId,
    participantIds: body.participantIds,
    total: body.total,
    rawReceiptText: body.rawReceiptText,
    receiptImageName: body.receiptImageName,
    items,
  });

  return NextResponse.json({ order });
}
