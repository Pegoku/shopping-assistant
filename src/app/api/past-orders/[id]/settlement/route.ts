import { NextResponse } from "next/server";
import { setSettlementPaid } from "@/lib/past-orders";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = ((await request.json().catch(() => ({}))) as { fromPersonId?: string; toPersonId?: string; paid?: boolean }) ?? {};

  if (!body.fromPersonId || !body.toPersonId) {
    return NextResponse.json({ error: "Missing settlement people" }, { status: 400 });
  }

  try {
    const order = await setSettlementPaid(id, body.fromPersonId, body.toPersonId, Boolean(body.paid));
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update settlement" }, { status: 400 });
  }
}
