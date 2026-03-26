"use client";

import { useFavourites } from "@/components/providers/favourites-provider";
import type { FavouriteItem } from "@/lib/types";

type FavouriteButtonProps = {
  item: FavouriteItem;
  className?: string;
};

export function FavouriteButton({ item, className = "" }: FavouriteButtonProps) {
  const { isFavourite, toggleItem } = useFavourites();
  const active = isFavourite(item.id);

  return (
    <button
      aria-label={active ? `Remove ${item.originalName} from favourites` : `Add ${item.originalName} to favourites`}
      aria-pressed={active}
      className={`inline-flex items-center justify-center rounded-full border transition-colors ${active ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100" : "border-gray-200 bg-white/90 text-gray-500 hover:bg-gray-50 hover:text-rose-500"} ${className}`.trim()}
      onClick={() => toggleItem(item)}
      type="button"
    >
      <svg aria-hidden="true" className="h-5 w-5" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24">
        <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    </button>
  );
}
