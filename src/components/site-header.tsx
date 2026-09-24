import Link from "next/link";
import { SITE } from "@/lib/site";
import { CategoriesMenu } from "./categories-menu";
import { QuoteLink } from "./quote-link";
import { SearchBox } from "./search-box";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <Link href="/" className="brand" aria-label={`${SITE.name} home`}>
          <span className="brand__mark" aria-hidden="true">{SITE.shortName}</span>
          <span className="brand__name">{SITE.name}</span>
        </Link>
        <CategoriesMenu />
        <div className="site-header__search">
          <SearchBox id="header-search" />
        </div>
        <QuoteLink />
      </div>
    </header>
  );
}
