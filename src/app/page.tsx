import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { countByCategory } from "@/components/catalog-view";
import { PartGrid } from "@/components/part-card";
import { SearchBox } from "@/components/search-box";
import { ButtonLink, ExternalButton } from "@/components/ui";
import { getParts } from "@/lib/catalog";
import { CATEGORIES } from "@/lib/categories";
import type { Part } from "@/lib/catalog-types";
import { SITE, whatsappLink } from "@/lib/site";

export const revalidate = 300;

const POPULAR_COUNT = 8;

// No sales data yet, so "popular" = priced, in-stock parts, one per category round-robin for variety.
// ponytail: swap for a hand-picked code list or real order counts once there are any.
function pickPopular(parts: Part[]): Part[] {
  const pool = parts.filter((p) => p.price != null && p.stock === "in" && p.cat !== "other");
  const byCat = CATEGORIES.map((c) => pool.filter((p) => p.cat === c.slug));
  const out: Part[] = [];
  for (let round = 0; out.length < POPULAR_COUNT && byCat.some((l) => l[round]); round++) {
    for (const list of byCat) if (list[round] && out.length < POPULAR_COUNT) out.push(list[round]);
  }
  return out;
}

const VALUE_POINTS = [
  { title: "Stock from our billing system", body: "Availability comes straight from our billing records." },
  { title: "GST billing", body: "Proper tax invoice with HSN on every order." },
  { title: "PAN-India dispatch", body: "Shipped to your workshop anywhere in India." },
];

export default async function Home() {
  const parts = await getParts();
  const counts = countByCategory(parts);
  const popular = pickPopular(parts);
  const wa = whatsappLink(`Hello ${SITE.name}, I'm looking for a part. Photo / old part number attached:`);

  return (
    <>
      <section className="hero">
        <div className="shell hero__inner">
          <p className="eyebrow hero__eyebrow">E-scooter spares · wholesale</p>
          <h1 className="hero__title">
            Every part to keep <span className="hero__mark">e-scooters</span> running.
          </h1>
          <p className="hero__lede">
            {parts.length.toLocaleString("en-IN")} parts for Ampere, Okinawa, Hero Optima, Vespa-style models and more. Search by part name or item code.
          </p>
          <div className="hero__search">
            <SearchBox id="hero-search" size="lg" />
          </div>
          <ul className="hero__values">
            {VALUE_POINTS.map((v) => (
              <li key={v.title}><strong>{v.title}</strong><span>{v.body}</span></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section shell" aria-labelledby="cat-heading">
        <div className="section__head">
          <h2 id="cat-heading">Shop by category</h2>
          <Link href="/parts" className="section__more">All parts →</Link>
        </div>
        <ul className="cat-tiles">
          {CATEGORIES.filter((c) => counts.get(c.slug)).map((c) => (
            <li key={c.slug}>
              <Link href={`/parts?cat=${c.slug}`} className="cat-tile">
                <CategoryIcon cat={c.slug} size={28} className="cat-tile__icon" />
                <span className="cat-tile__label">{c.label}</span>
                <span className="cat-tile__count">{counts.get(c.slug)} parts</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section shell lazy-section" aria-labelledby="popular-heading">
        <div className="section__head">
          <h2 id="popular-heading">Popular parts</h2>
          <Link href="/parts?stock=in" className="section__more">All in-stock →</Link>
        </div>
        <PartGrid parts={popular} label="Popular parts" />
      </section>

      <section className="wa-strip" aria-labelledby="wa-heading">
        <div className="shell wa-strip__inner">
          <div>
            <h2 id="wa-heading">Can&apos;t find it?</h2>
            <p>Send a photo or the old part number on WhatsApp. We&apos;ll match it and reply with price and stock.</p>
          </div>
          <div className="wa-strip__actions">
            <ExternalButton href={wa} variant="accent" size="lg">Chat on WhatsApp</ExternalButton>
            <ButtonLink href="/parts" size="lg" className="wa-strip__browse">Browse all parts</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
