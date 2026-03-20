import { NextResponse } from "next/server";
import { getCachedImageFile } from "@/lib/image-cache";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url")?.trim();

  if (!url) {
    return NextResponse.json({ error: "Missing image url" }, { status: 400 });
  }

  try {
    const image = await getCachedImageFile(url);

    return new NextResponse(new Uint8Array(image.buffer), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load image",
      },
      { status: 500 },
    );
  }
}
