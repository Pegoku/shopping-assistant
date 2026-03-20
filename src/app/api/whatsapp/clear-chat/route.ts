import { NextResponse } from "next/server";
import { clearWhatsAppChat } from "@/lib/whatsapp";

export const runtime = "nodejs";

type ClearChatBody = {
  to?: string;
};

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => ({}))) as ClearChatBody) ?? {};

  try {
    const result = await clearWhatsAppChat({
      to: body.to,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to clear WhatsApp chat",
      },
      { status: 500 },
    );
  }
}
