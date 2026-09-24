import type { Metadata } from "next";
import { ExternalButton } from "@/components/ui";
import { SITE, whatsappLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "About & contact",
  description: `About ${SITE.name}: e-scooter spare parts wholesale. Contact us on WhatsApp.`,
  alternates: { canonical: "/about" },
};

// Placeholder copy — every [FILL] needs real details before launch.
export default function AboutPage() {
  const wa = whatsappLink(`Hello ${SITE.name}, I have a question.`);
  return (
    <div className="shell page prose-page">
      <header className="page__head">
        <p className="eyebrow">About us</p>
        <h1>About {SITE.name}</h1>
      </header>

      <div className="about">
        <section className="about__story">
          <p>[FILL: 2–3 sentences — who you are, since when, what you supply (e-scooter spares for dealers and workshops), which brands/models you cover.]</p>
          <p>[FILL: why dealers buy from you — stock depth, dispatch speed, GST billing, returns policy.]</p>
          <h2>How ordering works</h2>
          <ol>
            <li>Search or browse the catalog and add parts to your quote.</li>
            <li>Send the quote on WhatsApp. We confirm final price, stock and dispatch date.</li>
            <li>Pay [FILL: payment terms — UPI / bank transfer / credit for regular dealers] and we ship with a GST invoice.</li>
          </ol>
        </section>

        <aside className="about__contact card" aria-labelledby="contact-heading">
          <h2 id="contact-heading">Contact</h2>
          <dl className="specs">
            <div><dt>Address</dt><dd>[FILL: shop address, city, state, PIN]</dd></div>
            <div><dt>Phone</dt><dd>[FILL]</dd></div>
            <div><dt>Hours</dt><dd>[FILL: e.g. Mon–Sat, 10:00–19:00]</dd></div>
            <div><dt>GSTIN</dt><dd className="mono">[FILL]</dd></div>
            <div><dt>Email</dt><dd>[FILL]</dd></div>
          </dl>
          <ExternalButton href={wa} variant="whatsapp" block>Message us on WhatsApp</ExternalButton>
        </aside>
      </div>
    </div>
  );
}
