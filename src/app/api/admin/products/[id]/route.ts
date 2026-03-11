import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as { currentPrice?: number; isDealActive?: boolean };
  const existing = await prisma.product.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 });
  }

  const nextPrice = body.currentPrice ?? existing.currentPrice;
  const nextDeal = body.isDealActive ?? existing.isDealActive;

  await prisma.product.update({
    where: { id },
    data: {
      currentPrice: nextPrice,
      isDealActive: nextDeal,
    },
  });

  await prisma.adminEdit.createMany({
    data: [
      {
        productId: id,
        fieldName: "currentPrice",
        previousValue: String(existing.currentPrice),
        nextValue: String(nextPrice),
      },
      {
        productId: id,
        fieldName: "isDealActive",
        previousValue: String(existing.isDealActive),
        nextValue: String(nextDeal),
      },
    ],
  });

  await prisma.priceHistory.create({
    data: {
      productId: id,
      price: nextPrice,
      unitPrice: existing.currentUnitPrice,
      isDeal: nextDeal,
      dealText: existing.dealText,
    },
  });

  return NextResponse.json({ ok: true });
}
