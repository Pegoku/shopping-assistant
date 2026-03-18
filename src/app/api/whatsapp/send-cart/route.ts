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

  console.log("[whatsapp] received send-cart request", {
    itemCount: Array.isArray(body.items) ? body.items.length : 0,
    hasRecipient: Boolean(body.to?.trim()),
  });

  if (!Array.isArray(body.items) || !body.items.length) {
    return NextResponse.json({ error: "Missing cart items" }, { status: 400 });
  }

  try {
    const result = await sendCartToWhatsApp({
      items: body.items,
      to: body.to,
    });

    console.log("[whatsapp] send-cart request succeeded", {
      provider: result.provider,
      sentCount: result.sentCount,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[whatsapp] send-cart request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send WhatsApp messages",
      },
      { status: 500 },
    );
  }
}
