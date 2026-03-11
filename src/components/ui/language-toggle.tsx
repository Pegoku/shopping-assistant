"use client";

import { useLanguage } from "@/components/providers/language-provider";
import clsx from "clsx";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex p-1 rounded-full bg-gray-100" aria-label="Language toggle">
      <button
        className={clsx("border-0 bg-transparent px-3 py-2 cursor-pointer rounded-full transition-colors", language === "en" && "bg-white shadow-sm")}
        onClick={() => setLanguage("en")}
        type="button"
      >
        English
      </button>
      <button
        className={clsx("border-0 bg-transparent px-3 py-2 cursor-pointer rounded-full transition-colors", language === "es" && "bg-white shadow-sm")}
        onClick={() => setLanguage("es")}
        type="button"
      >
        Espanol
      </button>
    </div>
  );
}
