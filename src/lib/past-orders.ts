import { PastOrderSource, Supermarket } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mapProductCard } from "@/lib/queries";
import type { PastOrderData, ReceiptScanItem, SettlementRow } from "@/lib/types";

type OrderWithRelations = Awaited<ReturnType<typeof getOrderRecord>>;

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizeReceiptAlias(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function productInclude() {
  return {
    categories: {
      include: {
        category: true,
      },
    },
    priceHistory: {
      orderBy: {
        capturedAt: "desc" as const,
      },
      take: 8,
    },
  };
}

function orderInclude() {
  return {
    payer: true,
    items: {
      orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
      include: {
        product: {
          include: productInclude(),
        },
        shares: {
          include: {
            person: true,
          },
        },
      },
    },
    settlementPayments: true,
  };
}

async function getOrderRecord(id: string) {
  return prisma.pastOrder.findUnique({
    where: { id },
    include: orderInclude(),
  });
}

function calculateSettlement(order: NonNullable<OrderWithRelations>): SettlementRow[] {
  if (!order.payer) {
    return [];
  }

  const names = new Map<string, string>([[order.payer.id, order.payer.name]]);
  const balances = new Map<string, number>([[order.payer.id, 0]]);
  let assignedTotal = 0;

  for (const item of order.items) {
    for (const share of item.shares) {
      const amount = item.totalPrice * (share.percent / 100);
      names.set(share.personId, share.person.name);
      balances.set(share.personId, (balances.get(share.personId) ?? 0) - amount);
      assignedTotal += amount;
    }
  }

  if (assignedTotal <= 0) {
    return [];
  }

  balances.set(order.payer.id, (balances.get(order.payer.id) ?? 0) + assignedTotal);

  const debtors = Array.from(balances.entries())
    .map(([personId, balance]) => ({ personId, balance: cents(balance) }))
    .filter((entry) => entry.balance < -0.005)
    .sort((left, right) => left.balance - right.balance);
  const creditors = Array.from(balances.entries())
    .map(([personId, balance]) => ({ personId, balance: cents(balance) }))
    .filter((entry) => entry.balance > 0.005)
    .sort((left, right) => right.balance - left.balance);
  const rows: SettlementRow[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = cents(Math.min(-debtor.balance, creditor.balance));

    if (amount > 0) {
      const payment = order.settlementPayments.find((entry) => entry.fromPersonId === debtor.personId && entry.toPersonId === creditor.personId);

      rows.push({
        fromPersonId: debtor.personId,
        fromName: names.get(debtor.personId) ?? "Unknown",
        toPersonId: creditor.personId,
        toName: names.get(creditor.personId) ?? "Unknown",
        amount,
        paidAt: payment?.paidAt.toISOString() ?? null,
      });
    }

    debtor.balance = cents(debtor.balance + amount);
    creditor.balance = cents(creditor.balance - amount);

    if (Math.abs(debtor.balance) < 0.005) {
      debtorIndex += 1;
    }
    if (creditor.balance < 0.005) {
      creditorIndex += 1;
    }
  }

  return rows;
}

export function mapPastOrder(order: NonNullable<OrderWithRelations>): PastOrderData {
  return {
    id: order.id,
    supermarket: order.supermarket,
    source: order.source,
    orderedAt: order.orderedAt.toISOString(),
    total: order.total,
    rawReceiptText: order.rawReceiptText,
    receiptImageName: order.receiptImageName,
    payer: order.payer ? { id: order.payer.id, name: order.payer.name } : null,
    settlement: calculateSettlement(order),
    items: order.items.map((item) => ({
      id: item.id,
      receiptName: item.receiptName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      dealText: item.dealText,
      aiConfidence: item.aiConfidence,
      product: item.product ? mapProductCard(item.product) : null,
      shares: item.shares.map((share) => ({
        personId: share.personId,
        personName: share.person.name,
        percent: share.percent,
      })),
    })),
  };
}

export async function listPeople() {
  const people = await prisma.person.findMany({ orderBy: { name: "asc" } });
  return people.map((person) => ({ id: person.id, name: person.name }));
}

export async function upsertPerson(name: string) {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new Error("Person name is required");
  }

  return prisma.person.upsert({
    where: { name: trimmed },
    update: {},
    create: { name: trimmed },
  });
}

export async function listPastOrders() {
  const orders = await prisma.pastOrder.findMany({
    orderBy: { orderedAt: "desc" },
    include: orderInclude(),
  });
  return orders.map(mapPastOrder);
}

export async function getPastOrder(id: string) {
  const order = await getOrderRecord(id);
  return order ? mapPastOrder(order) : null;
}

async function findProductForReceiptName(supermarket: Supermarket, receiptName: string, totalPrice?: number | null) {
  const normalized = normalizeReceiptAlias(receiptName);
  const alias = await prisma.receiptProductAlias.findUnique({
    where: {
      supermarket_normalized: {
        supermarket,
        normalized,
      },
    },
    include: {
      product: {
        include: productInclude(),
      },
    },
  });

  if (alias) {
    return { product: alias.product, confidence: 1 };
  }

  const tokens = normalized.split(" ").filter((token) => token.length > 2).slice(0, 5);
  const products = await prisma.product.findMany({
    where: {
      supermarket,
      OR: [
        { originalName: { contains: receiptName } },
        { genericNameEn: { contains: receiptName } },
        { genericNameEs: { contains: receiptName } },
        ...tokens.flatMap((token) => [
          { originalName: { contains: token } },
          { genericNameEn: { contains: token } },
          { genericNameEs: { contains: token } },
        ]),
      ],
    },
    include: productInclude(),
    take: 40,
  });

  const scored = products
    .map((product) => {
      const haystack = normalizeReceiptAlias(`${product.originalName} ${product.genericNameEn} ${product.genericNameEs} ${product.quantityText}`);
      const overlap = tokens.filter((token) => haystack.includes(token)).length;
      const pricePenalty = totalPrice ? Math.min(Math.abs(product.currentPrice - totalPrice) / Math.max(totalPrice, 1), 1) : 0.2;
      const score = overlap / Math.max(tokens.length, 1) - pricePenalty * 0.25;
      return { product, score };
    })
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  return best && best.score > 0 ? { product: best.product, confidence: Math.min(0.95, Math.max(0.35, best.score)) } : { product: null, confidence: null };
}

export async function matchReceiptItems(supermarket: Supermarket, items: Array<{ receiptName: string; quantity: number; unitPrice: number | null; totalPrice: number; dealText?: string | null }>): Promise<ReceiptScanItem[]> {
  return Promise.all(
    items.map(async (item) => {
      const match = await findProductForReceiptName(supermarket, item.receiptName, item.totalPrice);

      return {
        ...item,
        dealText: item.dealText ?? null,
        product: match.product ? mapProductCard(match.product) : null,
        aiConfidence: match.confidence,
      };
    }),
  );
}

export async function upsertReceiptAlias(supermarket: Supermarket, alias: string, productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });

  if (!product || product.supermarket !== supermarket) {
    throw new Error("Product does not belong to this order's supermarket");
  }

  return prisma.receiptProductAlias.upsert({
    where: {
      supermarket_normalized: {
        supermarket,
        normalized: normalizeReceiptAlias(alias),
      },
    },
    update: { alias, productId },
    create: { supermarket, alias, normalized: normalizeReceiptAlias(alias), productId },
  });
}

export async function createPastOrder(input: {
  supermarket: Supermarket;
  source?: PastOrderSource;
  orderedAt?: string | null;
  payerId?: string | null;
  participantIds?: string[];
  total?: number | null;
  rawReceiptText?: string | null;
  receiptImageName?: string | null;
  items: Array<{
    receiptName: string;
    quantity: number;
    unitPrice?: number | null;
    totalPrice: number;
    dealText?: string | null;
    productId?: string | null;
    aiConfidence?: number | null;
  }>;
}) {
  const total = input.total ?? input.items.reduce((sum, item) => sum + item.totalPrice, 0);

  const order = await prisma.pastOrder.create({
    data: {
      supermarket: input.supermarket,
      source: input.source ?? PastOrderSource.MANUAL,
      orderedAt: input.orderedAt ? new Date(input.orderedAt) : new Date(),
      payerId: input.payerId || null,
      total,
      rawReceiptText: input.rawReceiptText,
      receiptImageName: input.receiptImageName,
      items: {
        create: input.items.map((item, index) => ({
          receiptName: item.receiptName.trim(),
          quantity: item.quantity > 0 ? item.quantity : 1,
          unitPrice: item.unitPrice ?? null,
          totalPrice: item.totalPrice,
          dealText: item.dealText ?? null,
          productId: item.productId || null,
          aiConfidence: item.aiConfidence ?? null,
          sortOrder: index,
        })),
      },
    },
  });

  for (const item of input.items) {
    if (item.productId) {
      await upsertReceiptAlias(input.supermarket, item.receiptName, item.productId);
    }
  }

  return getPastOrder(order.id);
}

export async function updateOrderItemLink(orderId: string, itemId: string, productId: string | null) {
  const order = await prisma.pastOrder.findUnique({ where: { id: orderId } });
  const item = await prisma.pastOrderItem.findUnique({ where: { id: itemId } });

  if (!order || !item || item.orderId !== orderId) {
    throw new Error("Order item not found");
  }

  if (productId) {
    await upsertReceiptAlias(order.supermarket, item.receiptName, productId);
  }

  const sameStoreOrders = await prisma.pastOrder.findMany({
    where: { supermarket: order.supermarket },
    include: { items: true },
  });
  const normalizedCode = normalizeReceiptAlias(item.receiptName);
  const matchingItemIds = sameStoreOrders.flatMap((entry) => entry.items.filter((orderItem) => normalizeReceiptAlias(orderItem.receiptName) === normalizedCode).map((orderItem) => orderItem.id));

  await prisma.pastOrderItem.updateMany({
    where: { id: { in: matchingItemIds.length ? matchingItemIds : [itemId] } },
    data: { productId },
  });

  return getPastOrder(orderId);
}

export async function updateOrderItemShares(orderId: string, itemId: string, shares: Array<{ personId: string; percent: number }>) {
  const item = await prisma.pastOrderItem.findUnique({ where: { id: itemId } });

  if (!item || item.orderId !== orderId) {
    throw new Error("Order item not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.pastOrderItemShare.deleteMany({ where: { itemId } });

    for (const share of shares.filter((entry) => entry.personId && entry.percent > 0)) {
      await tx.pastOrderItemShare.create({
        data: {
          itemId,
          personId: share.personId,
          percent: share.percent,
        },
      });
    }
  });

  return getPastOrder(orderId);
}

export async function setSettlementPaid(orderId: string, fromPersonId: string, toPersonId: string, paid: boolean) {
  const order = await prisma.pastOrder.findUnique({ where: { id: orderId } });

  if (!order) {
    throw new Error("Order not found");
  }

  if (paid) {
    await prisma.pastOrderSettlementPayment.upsert({
      where: {
        orderId_fromPersonId_toPersonId: {
          orderId,
          fromPersonId,
          toPersonId,
        },
      },
      update: { paidAt: new Date() },
      create: { orderId, fromPersonId, toPersonId },
    });
  } else {
    await prisma.pastOrderSettlementPayment.deleteMany({
      where: { orderId, fromPersonId, toPersonId },
    });
  }

  return getPastOrder(orderId);
}
