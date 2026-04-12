import { NextResponse } from "next/server";
import { getSharedCartItems, normalizeCartItem, saveSharedCartItems } from "@/lib/shared-state";
import type { CartItem } from "@/lib/types";

type CartBody = {
  items?: CartItem[];
};

export async function GET() {
  const items = await getSharedCartItems();
  return NextResponse.json({ items });
}

export async function PUT(request: Request) {
  const body = ((await request.json().catch(() => ({}))) as CartBody) ?? {};

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "Missing cart items" }, { status: 400 });
  }

  const items = await saveSharedCartItems(body.items.map(normalizeCartItem));
  return NextResponse.json({ items });
}
