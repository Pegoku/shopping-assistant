import type { CartItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export function getUpstreamImageUrl(item: Pick<CartItem, "imageUrl" | "originalName">) {
  if (!item.imageUrl || item.imageUrl.includes("images.ctfassets.net")) {
    return `https://placehold.co/400x400/f8fafc/94a3b8.png?text=${encodeURIComponent(item.originalName)}`;
  }

  return item.imageUrl;
}

export function getShareableImageUrl(item: Pick<CartItem, "imageUrl" | "originalName">) {
  return `/api/images/cache?url=${encodeURIComponent(getUpstreamImageUrl(item))}`;
}

export function buildCartItemWhatsAppCaption(item: Pick<CartItem, "originalName" | "currentPrice">) {
  return `${item.originalName}\nWeb price: ${formatCurrency(item.currentPrice)}`;
}
