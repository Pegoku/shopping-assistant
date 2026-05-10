import { Supermarket } from "@prisma/client";
import { NextResponse } from "next/server";
import { updatePastOrder } from "@/lib/past-orders";

type Params = {
  params: Promise<{ id: string }>;
};

type OrderBody = {
  supermarket?: "AH" | "JUMBO";
  orderedAt?: string | null;
  payerId?: string | null;
  total?: number | null;
  rawReceiptText?: string | null;
  receiptImageName?: string | null;
  items?: Array<{
    id?: string | null;
    receiptName?: string;
    quantity?: number;
    unitPrice?: number | null;
    totalPrice?: number;
    dealText?: string | null;
    productId?: string | null;
    aiConfidence?: number | null;
  }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = ((await request.json().catch(() => ({}))) as OrderBody) ?? {};

  if (!body.supermarket || !Object.values(Supermarket).includes(body.supermarket as Supermarket)) {
    return NextResponse.json({ error: "Missing or invalid supermarket" }, { status: 400 });
  }

  const items = (body.items ?? [])
    .map((item) => ({
      id: item.id ?? null,
      receiptName: item.receiptName?.trim() ?? "",
      quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1,
      unitPrice: typeof item.unitPrice === "number" ? item.unitPrice : null,
      totalPrice: typeof item.totalPrice === "number" ? item.totalPrice : 0,
      dealText: item.dealText?.trim() || null,
      productId: item.productId ?? null,
      aiConfidence: typeof item.aiConfidence === "number" ? item.aiConfidence : null,
    }))
    .filter((item) => item.receiptName && item.totalPrice >= 0);

  if (!items.length) {
    return NextResponse.json({ error: "Add at least one order item" }, { status: 400 });
  }

  try {
    const order = await updatePastOrder({
      id,
      supermarket: body.supermarket as Supermarket,
      orderedAt: body.orderedAt,
      payerId: body.payerId,
      total: body.total,
      rawReceiptText: body.rawReceiptText,
      receiptImageName: body.receiptImageName,
      items,
    });

    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update order" }, { status: 400 });
  }
}
