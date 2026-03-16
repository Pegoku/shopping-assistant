import { NextResponse } from "next/server";
import { sendCartToWhatsApp } from "@/lib/whatsapp";
import type { CartItem } from "@/lib/types";

export const runtime = "nodejs";

type SendCartBody = {
  items?: CartItem[];
  to?: string;
};

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => ({}))) as SendCartBody) ?? {};

  if (!Array.isArray(body.items) || !body.items.length) {
    return NextResponse.json({ error: "Missing cart items" }, { status: 400 });
  }

  try {
    const result = await sendCartToWhatsApp({
      items: body.items,
      to: body.to,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send WhatsApp messages",
      },
      { status: 500 },
    );
  }
}
