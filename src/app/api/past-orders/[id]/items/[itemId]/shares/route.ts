import { NextResponse } from "next/server";
import { updateOrderItemShares } from "@/lib/past-orders";

type Params = {
  params: Promise<{ id: string; itemId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const { id, itemId } = await params;
  const body = ((await request.json().catch(() => ({}))) as { shares?: Array<{ personId?: string; percent?: number }> }) ?? {};
  const shares = (body.shares ?? [])
    .map((share) => ({ personId: share.personId ?? "", percent: typeof share.percent === "number" ? share.percent : 0 }))
    .filter((share) => share.personId && share.percent > 0);
  const total = shares.reduce((sum, share) => sum + share.percent, 0);

  if (total > 100.5) {
    return NextResponse.json({ error: "Shares cannot add up to more than 100%" }, { status: 400 });
  }

  try {
    const order = await updateOrderItemShares(id, itemId, shares);
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update shares" }, { status: 400 });
  }
}
