"use client";

import Link from "next/link";
import { useFavourites } from "@/components/providers/favourites-provider";

export function FavouritesLink() {
  const { items } = useFavourites();

  return (
    <Link className="inline-flex items-center gap-2 px-3 py-2 bg-white/40 hover:bg-black/5 transition-colors rounded-full" href="/favourites">
      Favourites
      <span>{items.length}</span>
    </Link>
  );
}
