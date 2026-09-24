import type { Metadata } from "next";
import { SearchBox } from "@/components/search-box";
import { ButtonLink, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="shell page">
      <EmptyState
        icon={<span className="not-found__code" aria-hidden="true">404</span>}
        title="This part isn't on the shelf"
        actions={<ButtonLink href="/parts" variant="primary">Browse all parts</ButtonLink>}
      >
        The page or part code you opened doesn&apos;t exist, or the item is no longer listed. Try a search instead:
        <div className="not-found__search"><SearchBox id="notfound-search" /></div>
      </EmptyState>
    </div>
  );
}
