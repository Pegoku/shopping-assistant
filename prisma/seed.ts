import { PrismaClient, Supermarket } from "@prisma/client";

const prisma = new PrismaClient();

type HistoryEntry = {
  offset: number;
  price: number;
  unitPrice: number;
  isDeal: boolean;
  dealText?: string;
};

type SeedProduct = {
  supermarket: Supermarket;
  originalName: string;
  genericNameEn: string;
  genericNameEs: string;
  quantityText: string;
  unitAmount: number;
  normalizedUnit: string;
  currentPrice: number;
  currentUnitPrice: number;
  imageUrl: string;
  sourceUrl: string;
  dealText?: string;
  isDealActive: boolean;
  categorySlug: string;
  history: HistoryEntry[];
};

async function main() {
  await prisma.adminEdit.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.product.deleteMany();
  await prisma.fetchRun.deleteMany();

  const categories = await Promise.all([
    prisma.category.create({ data: { slug: "fruit", label: "Fruit" } }),
    prisma.category.create({ data: { slug: "bakery", label: "Bakery" } }),
    prisma.category.create({ data: { slug: "dairy", label: "Dairy" } }),
  ]);

  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  const products: SeedProduct[] = [
    {
      supermarket: Supermarket.AH,
      originalName: "Biologische bananen",
      genericNameEn: "banana",
      genericNameEs: "platano",
      quantityText: "1 kg",
      unitAmount: 1,
      normalizedUnit: "kg",
      currentPrice: 2.29,
      currentUnitPrice: 2.29,
      imageUrl: "https://placehold.co/400x400/f8fafc/94a3b8.png?text=Banana",
      sourceUrl: "https://www.ah.nl/",
      dealText: "2e halve prijs",
      isDealActive: true,
      categorySlug: "fruit",
      history: [
        { offset: 7, price: 2.14, unitPrice: 2.14, isDeal: false },
        { offset: 1, price: 2.18, unitPrice: 2.18, isDeal: false },
        { offset: 0, price: 2.29, unitPrice: 2.29, isDeal: true, dealText: "2e halve prijs" },
      ],
    },
    {
      supermarket: Supermarket.JUMBO,
      originalName: "Fairtrade bananen",
      genericNameEn: "banana",
      genericNameEs: "platano",
      quantityText: "1 kg",
      unitAmount: 1,
      normalizedUnit: "kg",
      currentPrice: 2.09,
      currentUnitPrice: 2.09,
      imageUrl: "https://placehold.co/400x400/f8fafc/94a3b8.png?text=Banana",
      sourceUrl: "https://www.jumbo.com/",
      isDealActive: false,
      categorySlug: "fruit",
      history: [
        { offset: 7, price: 1.95, unitPrice: 1.95, isDeal: false },
        { offset: 1, price: 1.99, unitPrice: 1.99, isDeal: false },
        { offset: 0, price: 2.09, unitPrice: 2.09, isDeal: false },
      ],
    },
    {
      supermarket: Supermarket.AH,
      originalName: "Volle yoghurt Griekse stijl",
      genericNameEn: "greek yogurt",
      genericNameEs: "yogur griego",
      quantityText: "1 l",
      unitAmount: 1,
      normalizedUnit: "l",
      currentPrice: 1.89,
      currentUnitPrice: 1.89,
      imageUrl: "https://placehold.co/400x400/f8fafc/94a3b8.png?text=Yogurt",
      sourceUrl: "https://www.ah.nl/",
      isDealActive: false,
      categorySlug: "dairy",
      history: [
        { offset: 7, price: 1.75, unitPrice: 1.75, isDeal: false },
        { offset: 1, price: 1.82, unitPrice: 1.82, isDeal: false },
        { offset: 0, price: 1.89, unitPrice: 1.89, isDeal: false },
      ],
    },
    {
      supermarket: Supermarket.JUMBO,
      originalName: "Rustiek zuurdesembrood",
      genericNameEn: "sourdough bread",
      genericNameEs: "pan de masa madre",
      quantityText: "800 g",
      unitAmount: 0.8,
      normalizedUnit: "kg",
      currentPrice: 2.79,
      currentUnitPrice: 3.49,
      imageUrl: "https://placehold.co/400x400/f8fafc/94a3b8.png?text=Bread",
      sourceUrl: "https://www.jumbo.com/",
      dealText: "25% korting",
      isDealActive: true,
      categorySlug: "bakery",
      history: [
        { offset: 7, price: 2.95, unitPrice: 3.69, isDeal: false },
        { offset: 1, price: 2.99, unitPrice: 3.74, isDeal: false },
        { offset: 0, price: 2.79, unitPrice: 3.49, isDeal: true, dealText: "25% korting" },
      ],
    },
  ];

  for (const productData of products) {
    const category = categories.find((item) => item.slug === productData.categorySlug);

    const product = await prisma.product.create({
      data: {
        supermarket: productData.supermarket,
        originalName: productData.originalName,
        genericNameEn: productData.genericNameEn,
        genericNameEs: productData.genericNameEs,
        quantityText: productData.quantityText,
        unitAmount: productData.unitAmount,
        normalizedUnit: productData.normalizedUnit,
        currentPrice: productData.currentPrice,
        currentUnitPrice: productData.currentUnitPrice,
        imageUrl: productData.imageUrl,
        sourceUrl: productData.sourceUrl,
        dealText: productData.dealText,
        isDealActive: productData.isDealActive,
        lastFetchedAt: now,
        categories: category
          ? {
              create: {
                categoryId: category.id,
              },
            }
          : undefined,
      },
    });

    await prisma.priceHistory.createMany({
      data: productData.history.map((entry) => ({
        productId: product.id,
        price: entry.price,
        unitPrice: entry.unitPrice,
        isDeal: entry.isDeal,
        dealText: entry.dealText,
        capturedAt: new Date(now.getTime() - entry.offset * day),
      })),
    });
  }

  await prisma.fetchRun.create({
    data: {
      status: "SUCCESS",
      sourceMode: "mock",
      itemsFetched: products.length,
      itemsCreated: products.length,
      itemsUpdated: 0,
      completedAt: now,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
