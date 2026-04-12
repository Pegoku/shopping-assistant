import { NextResponse } from "next/server";
import { getSharedFavouriteItems, normalizeFavouriteItem, saveSharedFavouriteItems } from "@/lib/shared-state";
import type { FavouriteItem } from "@/lib/types";

type FavouritesBody = {
  items?: FavouriteItem[];
};

export async function GET() {
  const items = await getSharedFavouriteItems();
  return NextResponse.json({ items });
}

export async function PUT(request: Request) {
  const body = ((await request.json().catch(() => ({}))) as FavouritesBody) ?? {};

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "Missing favourite items" }, { status: 400 });
  }

  const items = await saveSharedFavouriteItems(body.items.map(normalizeFavouriteItem));
  return NextResponse.json({ items });
}
