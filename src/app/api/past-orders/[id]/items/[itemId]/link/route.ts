import { NextResponse } from "next/server";
import { updateOrderItemLink } from "@/lib/past-orders";

type Params = {
  params: Promise<{ id: string; itemId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const { id, itemId } = await params;
  const body = ((await request.json().catch(() => ({}))) as { productId?: string | null }) ?? {};

  try {
    const order = await updateOrderItemLink(id, itemId, body.productId ?? null);
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to link item" }, { status: 400 });
  }
}
