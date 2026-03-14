import { NextResponse } from "next/server";
import { getRecommendedProducts } from "@/lib/queries";
import type { RecommendationSortMode } from "@/lib/types";

export async function POST(request: Request) {
  if (process.env.ENABLE_RECOMMENDATIONS !== "true") {
    return NextResponse.json({ error: "Recommendations are disabled" }, { status: 403 });
  }

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
