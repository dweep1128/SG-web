"use client";
import Link from "next/link";
import { FormEvent, ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type CartItem = { busy_code: number; busy_name: string; price: number | null; quantity: number };
type CartContextType = {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  update: (busyCode: number, delta: number) => void;
  remove: (busyCode: number) => void;
  count: number;
};
const CartContext = createContext<CartContextType | null>(null);
export const useQuoteCart = () => {
  const value = useContext(CartContext);
  if (!value) throw new Error("Quote cart must be used inside SiteChrome");
  return value;
};

function NavSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  function search(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/products?q=${encodeURIComponent(value)}` : "/products");
  }
  return (
    <form className="nav-search" onSubmit={search}>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search parts…" aria-label="Search parts" />
      <button type="submit" aria-label="Search">⌕</button>
    </form>
  );
}

function Header() {
  const { count } = useQuoteCart();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="shell nav-row">
        <Link className="brand" href="/">
          <span className="brand-mark">SK</span>
          <span>SK <small>TRADERS</small></span>
        </Link>
        <NavSearch />
        <nav className="desktop-nav">
          <Link href="/">Home</Link>
          <Link href="/products">All Parts</Link>
        </nav>
        <div className="nav-actions">
          <button className="nav-menu" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">☰</button>
          <Link className="cart-btn" href="/quote" aria-label="Quote list">
            Quote {count > 0 && <b>{count}</b>}
          </Link>
        </div>
      </div>
      {menuOpen && (
        <div className="shell mobile-menu open">
          <Link href="/" onClick={() => setMenuOpen(false)}>Home</Link>
          <Link href="/products" onClick={() => setMenuOpen(false)}>All Parts</Link>
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer-grid">
        <div>
          <Link className="brand" href="/" style={{ color: "#f3f1ea" }}>
            <span className="brand-mark">SK</span>
            <span>SK <small>TRADERS</small></span>
          </Link>
          <p>Genuine e-scooter spare parts for India&apos;s dealer and workshop network.</p>
        </div>
        <div>
          <b>Need a part identified?</b>
          <p>Build a quote list and confirm availability with our team on WhatsApp.</p>
        </div>
        <small>© {new Date().getFullYear()} SK Traders</small>
      </div>
    </footer>
  );
}

const STORAGE_KEY = "sk-quote-cart";

export function SiteChrome({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setItems(JSON.parse(saved));
    } catch {
      // ponytail: private-browsing / blocked storage — cart just starts empty, no crash.
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage full or blocked — cart still works for this session, just won't persist.
    }
  }, [items, hydrated]);

  const value = useMemo<CartContextType>(
    () => ({
      items,
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      add: (item, quantity = 1) =>
        setItems((current) => {
          const exists = current.find((entry) => entry.busy_code === item.busy_code);
          return exists
            ? current.map((entry) => (entry.busy_code === item.busy_code ? { ...entry, quantity: entry.quantity + quantity } : entry))
            : [...current, { ...item, quantity }];
        }),
      update: (busyCode, delta) =>
        setItems((current) =>
          current.map((entry) => (entry.busy_code === busyCode ? { ...entry, quantity: Math.max(1, entry.quantity + delta) } : entry))
        ),
      remove: (busyCode) => setItems((current) => current.filter((entry) => entry.busy_code !== busyCode)),
    }),
    [items]
  );

  return (
    <CartContext.Provider value={value}>
      <Header />
      <main>{children}</main>
      <Footer />
    </CartContext.Provider>
  );
}
