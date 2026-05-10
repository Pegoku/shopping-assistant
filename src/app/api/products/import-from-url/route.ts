import { Supermarket } from "@prisma/client";
import { NextResponse } from "next/server";
import { importProductFromUrl } from "@/lib/product-import";

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => ({}))) as { url?: string; supermarket?: "AH" | "JUMBO" | null }) ?? {};

  if (!body.url) {
    return NextResponse.json({ error: "Missing product URL" }, { status: 400 });
  }

  try {
    const product = await importProductFromUrl({
      url: body.url,
      supermarket: body.supermarket ? (body.supermarket as Supermarket) : null,
    });
    return NextResponse.json({ product });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to import product" }, { status: 400 });
  }
}
