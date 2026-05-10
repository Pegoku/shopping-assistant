import { NextResponse } from "next/server";
import { listPeople, upsertPerson } from "@/lib/past-orders";

export async function GET() {
  return NextResponse.json({ people: await listPeople() });
}

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => ({}))) as { name?: string }) ?? {};

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Missing person name" }, { status: 400 });
  }

  const person = await upsertPerson(body.name);
  return NextResponse.json({ person: { id: person.id, name: person.name } });
}
