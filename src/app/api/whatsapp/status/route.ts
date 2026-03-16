import { NextResponse } from "next/server";
import { getWhatsAppStatus } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getWhatsAppStatus();
  return NextResponse.json(status);
}
