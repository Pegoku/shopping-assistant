import { NextResponse } from "next/server";
import { getRecommendedProducts } from "@/lib/queries";
import type { RecommendationSortMode } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    text?: string;
    sort?: RecommendationSortMode;
  };

  const text = body.text?.trim();

  if (!text) {
    return NextResponse.json({ error: "Missing request text" }, { status: 400 });
  }

  const result = await getRecommendedProducts(text, body.sort ?? "unitPrice");
  return NextResponse.json(result);
}
