import type { Metadata } from "next";
import "./globals.css";
import { SiteChrome } from "@/components/site-chrome";

export const metadata: Metadata = { title: "SK Traders | EV Scooty Spare Parts", description: "Quality e-scooter spare parts for dealers and workshops across India." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser extensions and the persisted colour preference can add document-level
  // attributes before React hydrates. The app manages its own theme after mount.
  return <html lang="en" suppressHydrationWarning><body suppressHydrationWarning><SiteChrome>{children}</SiteChrome></body></html>;
}
