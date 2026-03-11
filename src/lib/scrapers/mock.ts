import { Supermarket } from "@prisma/client";
import type { ScrapeResult } from "@/lib/scrapers/types";

export async function scrapeMockStores(): Promise<ScrapeResult[]> {
  return [
    {
      supermarket: Supermarket.AH,
      products: [
        {
          supermarket: Supermarket.AH,
          originalName: "Biologische bananen",
          genericNameEn: "banana",
          genericNameEs: "platano",
          quantityText: "1 kg",
          unitAmount: 1,
          normalizedUnit: "kg",
          currentPrice: 2.31,
          currentUnitPrice: 2.31,
          imageUrl:
            "https://placehold.co/400x400/f8fafc/94a3b8.png?text=Banana",
          sourceUrl: "https://www.ah.nl/",
          dealText: "2e halve prijs",
          isDealActive: true,
          categories: ["Fruit"],
        },
      ],
    },
    {
      supermarket: Supermarket.JUMBO,
      products: [
        {
          supermarket: Supermarket.JUMBO,
          originalName: "Fairtrade bananen",
          genericNameEn: "banana",
          genericNameEs: "platano",
          quantityText: "1 kg",
          unitAmount: 1,
          normalizedUnit: "kg",
          currentPrice: 2.12,
          currentUnitPrice: 2.12,
          imageUrl:
            "https://placehold.co/400x400/f8fafc/94a3b8.png?text=Banana",
          sourceUrl: "https://www.jumbo.com/",
          isDealActive: false,
          categories: ["Fruit"],
        },
      ],
    },
  ];
}
