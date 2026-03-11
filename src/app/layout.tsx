import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import "@/app/globals.css";
import { CartLink } from "@/components/ui/cart-link";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { CartProvider } from "@/components/providers/cart-provider";
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
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        <LanguageProvider>
          <CartProvider>
            <div className="app-shell">
              <div className="background-orb background-orb--one" />
              <div className="background-orb background-orb--two" />

              <header className="site-header">
                <Link className="brand-mark" href="/">
                  <span>Market Mirror</span>
                  <small>AH + Jumbo intelligence</small>
                </Link>

                <nav className="site-nav">
                  <Link href="/">Compare</Link>
                  <Link href="/admin">Admin</Link>
                  <CartLink />
                  <LanguageToggle />
                </nav>
              </header>

              <main>{children}</main>
            </div>
          </CartProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
