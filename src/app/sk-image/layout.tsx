import type { Metadata } from "next";
import "./sk-image.css";

export const metadata: Metadata = { title: "SK-image", robots: { index: false, follow: false } };

// .sk hides the storefront header/footer (see sk-image.css) so staff get the portal nav only.
export default function SkImageLayout({ children }: { children: React.ReactNode }) {
  return <div className="sk">{children}</div>;
}
