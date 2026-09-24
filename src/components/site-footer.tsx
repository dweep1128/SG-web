import Link from "next/link";
import { CONTACT, SITE, whatsappLink } from "@/lib/site";

export function SiteFooter() {
  const wa = whatsappLink(`Hello ${SITE.name}, I have a question about a part.`);
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div>
          <p className="site-footer__brand">{SITE.name}</p>
          <p className="site-footer__muted">{SITE.tagline}.</p>
          {CONTACT.address && <p className="site-footer__muted">{CONTACT.address}</p>}
          {CONTACT.gstin && <p className="site-footer__muted">GSTIN: {CONTACT.gstin}</p>}
        </div>
        <nav aria-label="Footer">
          <ul className="site-footer__links">
            <li><Link href="/parts">All parts</Link></li>
            <li><Link href="/quote">Your quote</Link></li>
            <li><Link href="/about">About &amp; contact</Link></li>
            {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer">WhatsApp us</a></li>}
          </ul>
        </nav>
      </div>
      <div className="shell site-footer__legal">
        <span>© {new Date().getFullYear()} {SITE.name}</span>
        <span>Prices and stock are indicative; confirmed on your quote.</span>
      </div>
    </footer>
  );
}
