import type { Metadata } from "next";
import { ExternalButton } from "@/components/ui";
import { whatsappLink } from "@/lib/site";
import "./consultancy.css";

export const metadata: Metadata = {
  title: "Automation for shops and wholesalers",
  description: "Orders, bills and dispatch that run without retyping. Simple automation for wholesalers and shop owners in India. Message on WhatsApp to talk it through.",
  alternates: { canonical: "/consultancy" },
};

// ── Fill these in. Everything on the page reads from here. ─────────────────────────────────────────────────
const WHATSAPP_MESSAGE = "Hi, I'd like to talk about automating some of my shop's work.";
const CALENDAR_URL = ""; // optional: a Calendly / Cal.com link. Empty = no "book a time" link.
// Real results only. Each: { result: "what changed, in one line", who: "business type / city", detail: "optional" }.
// Empty = the section is not shown. Never add a number you can't back up.
const PROOF: { result: string; who: string; detail?: string }[] = [];

const PROBLEMS = [
  { tag: "Entry 01", title: "The same thing typed twice", text: "An order comes on WhatsApp or paper, then someone retypes it into billing. It eats hours and every retype is a chance for a mistake." },
  { tag: "Entry 02", title: "Enquiries that go cold", text: "A customer messages at 9 pm. You reply next afternoon. By then they have bought from someone who answered." },
  { tag: "Entry 03", title: "Bills that don't match", text: "Wrong rate, wrong quantity. You find out after the parcel has left, and then you argue about it." },
];

const SERVICES = [
  { code: "S-01", title: "WhatsApp ordering", text: "Customers send orders on WhatsApp. They land in one clean list instead of ten chats." },
  { code: "S-02", title: "Invoice automation", text: "The bill is made from the order, so nobody types an item twice. Fewer wrong amounts." },
  { code: "S-03", title: "QR dispatch", text: "Scan a QR when a parcel leaves. You know what went out, to whom, and when." },
  { code: "S-04", title: "Owner dashboard", text: "Today's sales, stock and pending payments on one phone screen." },
];

const STEPS = [
  { title: "A short call", text: "You tell me where the time goes. No slides, no jargon." },
  { title: "I look at how you work", text: "I sit with your billing, your WhatsApp and your staff, and pick the one job worth fixing first." },
  { title: "Small build, real test", text: "I build only that one piece and your staff try it on real orders." },
  { title: "Go live and tidy up", text: "It goes live. Then I fix whatever is annoying before we touch anything else." },
];

const delay = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default function ConsultancyPage() {
  const wa = whatsappLink(WHATSAPP_MESSAGE);
  return (
    <div className="cx">
      <section className="cx-hero" aria-labelledby="cx-title">
        <div className="shell cx-hero__in">
          <p className="cx-tag reveal" style={delay(0)}>Automation for shops &amp; wholesalers</p>
          <h1 id="cx-title" className="reveal" style={delay(1)}>
            I take the <mark>retyping</mark> out of your shop.
          </h1>
          <p className="cx-hero__sub reveal" style={delay(2)}>
            Orders, bills and dispatch that run on their own, so your people stop copying the same thing from one place to another.
          </p>
          <div className="cx-hero__cta reveal" style={delay(3)}>
            <ExternalButton href={wa} variant="accent" size="lg">Talk on WhatsApp</ExternalButton>
            <span className="cx-note">Opens WhatsApp. No form, no sign-up.</span>
          </div>
        </div>
      </section>

      <section className="shell cx-sec" aria-labelledby="cx-problem">
        <p className="eyebrow">The problem</p>
        <h2 id="cx-problem">Where the day leaks away</h2>
        <ul className="cx-ledger">
          {PROBLEMS.map((p) => (
            <li key={p.tag}>
              <span className="cx-tag cx-tag--red">{p.tag}</span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="cx-band" aria-labelledby="cx-services">
        <div className="shell cx-sec">
          <p className="eyebrow">What I do</p>
          <h2 id="cx-services">Four things I build</h2>
          <ul className="cx-cards">
            {SERVICES.map((s) => (
              <li key={s.code}>
                <span className="cx-code">{s.code}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="shell cx-sec" aria-labelledby="cx-how">
        <p className="eyebrow">How it works</p>
        <h2 id="cx-how">From first call to going live</h2>
        <ol className="cx-steps">
          {STEPS.map((s) => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Shown only once there is a real result: no placeholders on the live site. */}
      {PROOF.length > 0 && (
        <section className="shell cx-sec" aria-labelledby="cx-proof">
          <p className="eyebrow">Proof</p>
          <h2 id="cx-proof">What changed for others</h2>
          <ul className="cx-proof">
            {PROOF.map((p) => (
              <li key={p.result}>
                <p className="cx-proof__result">{p.result}</p>
                {p.detail && <p>{p.detail}</p>}
                <span className="cx-tag">{p.who}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="cx-contact" aria-labelledby="cx-contact">
        <div className="shell cx-contact__in">
          <h2 id="cx-contact">Tell me what eats your time.</h2>
          <p>One message is enough to start. I will reply and we can talk it through.</p>
          <div className="cx-hero__cta">
            <ExternalButton href={wa} variant="accent" size="lg">Message on WhatsApp</ExternalButton>
            {CALENDAR_URL && <a className="cx-link" href={CALENDAR_URL} target="_blank" rel="noopener noreferrer">or book a time</a>}
          </div>
        </div>
      </section>
    </div>
  );
}
