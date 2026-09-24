import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/toast";
import { ALLOW_INDEXING, SITE } from "@/lib/site";

const display = Big_Shoulders({ subsets: ["latin"], axes: ["opsz"], variable: "--font-shoulders", display: "swap", adjustFontFallback: false });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-figtree", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  openGraph: { siteName: SITE.name, type: "website", locale: "en_IN" },
  robots: ALLOW_INDEXING ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0b6e4f" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
        <Toaster />
      </body>
    </html>
  );
}
