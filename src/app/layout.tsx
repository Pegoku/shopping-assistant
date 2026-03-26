import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import "@/app/globals.css";
import { CartLink } from "@/components/ui/cart-link";
import { FavouritesLink } from "@/components/ui/favourites-link";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { CartProvider } from "@/components/providers/cart-provider";
import { FavouritesProvider } from "@/components/providers/favourites-provider";
import { LanguageProvider } from "@/components/providers/language-provider";

const displayFont = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const bodyFont = Space_Grotesk({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Market Mirror",
  description: "Track grocery prices across AH and Jumbo with multilingual search and daily snapshots.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} antialiased bg-gray-50 text-gray-900 min-h-screen font-body`}>
        <LanguageProvider>
          <CartProvider>
            <FavouritesProvider>
              <div className="relative flex flex-col min-h-screen">
                <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-md">
                  <div className="mx-auto flex h-16 w-full items-center justify-between px-4 sm:px-6 lg:px-8">
                    <Link href="/" className="flex flex-col items-start gap-0.5 group">
                      <span className="font-display text-xl font-bold tracking-tight text-gray-900 group-hover:text-blue-600 transition-colors">Market Mirror</span>
                      <small className="text-xs font-medium text-gray-500 uppercase tracking-wider">AH + Jumbo</small>
                    </Link>

                    <nav className="flex items-center gap-3 sm:gap-4 md:gap-6">
                      <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Compare</Link>
                      <Link href="/admin" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Admin</Link>
                      <FavouritesLink />
                      <CartLink />
                      <LanguageToggle />
                    </nav>
                  </div>
                </header>

                <main className="flex-1 mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 md:py-12">
                  {children}
                </main>
              </div>
            </FavouritesProvider>
          </CartProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
