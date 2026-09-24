import type { Metadata } from "next";
import { ExternalButton } from "@/components/ui";
import { CONTACT, SITE, whatsappLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "About & contact",
  description: `About ${SITE.name}: e-scooter spare parts wholesale. Contact us on WhatsApp.`,
  alternates: { canonical: "/about" },
};

// Business details come from CONTACT in lib/site.ts; empty fields are simply not rendered.
export default function AboutPage() {
  const wa = whatsappLink(`Hello ${SITE.name}, I have a question.`);
  const details = ([["Address", CONTACT.address], ["Phone", CONTACT.phone], ["Hours", CONTACT.hours], ["GSTIN", CONTACT.gstin], ["Email", CONTACT.email]] as const).filter(([, v]) => v);
  return (
    <div className="shell page prose-page">
      <header className="page__head">
        <p className="eyebrow">About us</p>
        <h1>About {SITE.name}</h1>
      </header>

      <div className="about">
        <section className="about__story">
          {CONTACT.about.map((para) => <p key={para}>{para}</p>)}
          <h2>How ordering works</h2>
          <ol>
            <li>Search or browse the catalog and add parts to your quote.</li>
            <li>Send the quote on WhatsApp. We confirm final price, stock and dispatch date.</li>
            <li>{CONTACT.paymentTerms ? `Pay (${CONTACT.paymentTerms}) and we ship` : "We ship"} with a GST invoice.</li>
          </ol>
        </section>

        <aside className="about__contact card" aria-labelledby="contact-heading">
          <h2 id="contact-heading">Contact</h2>
          {details.length > 0 && (
            <dl className="specs">
              {details.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          )}
          <ExternalButton href={wa} variant="whatsapp" block>Message us on WhatsApp</ExternalButton>
        </aside>
      </div>
    </div>
  );
}
