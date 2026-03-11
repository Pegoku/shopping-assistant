"use client";

import { useLanguage } from "@/components/providers/language-provider";
import clsx from "clsx";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="pill-toggle" aria-label="Language toggle">
      <button
        className={clsx("pill-toggle__button", language === "en" && "is-active")}
        onClick={() => setLanguage("en")}
        type="button"
      >
        English
      </button>
      <button
        className={clsx("pill-toggle__button", language === "es" && "is-active")}
        onClick={() => setLanguage("es")}
        type="button"
      >
        Espanol
      </button>
    </div>
  );
}
