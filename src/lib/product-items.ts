import type { CartItem, FavouriteItem, ProductCardData } from "@/lib/types";

type ProductListItem = Pick<
  ProductCardData,
  "id" | "originalName" | "genericNameEn" | "genericNameEs" | "supermarket" | "currentPrice" | "quantityText" | "imageUrl"
>;

export function toCartItem(product: ProductListItem): CartItem {
  return {
    id: product.id,
    originalName: product.originalName,
    genericNameEn: product.genericNameEn,
    genericNameEs: product.genericNameEs,
    supermarket: product.supermarket,
    currentPrice: product.currentPrice,
    quantityText: product.quantityText,
    imageUrl: product.imageUrl,
    quantity: 1,
  };
}

export function toFavouriteItem(product: ProductListItem): FavouriteItem {
  return toCartItem(product);
}
