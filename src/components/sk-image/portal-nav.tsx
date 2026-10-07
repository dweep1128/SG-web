"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@/lib/sk-image";
import { SITE } from "@/lib/site";
import { browserSupabase } from "@/lib/supabase";

// Same brand bar as the storefront header; big tabs underneath on phones.
export function PortalNav({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const addActive = pathname.startsWith("/sk-image/add");

  async function logout() {
    await browserSupabase().auth.signOut();
    router.replace("/sk-image/login");
    router.refresh();
  }

  return (
    <header className="site-header sk-nav">
      <div className="shell sk-nav__inner">
        <Link href="/sk-image" className="brand">
          <span className="brand__mark" aria-hidden="true">{SITE.shortName}</span>
          <span className="brand__name">SK-image{role && <span className="sk-nav__role"> · {role}</span>}</span>
        </Link>
        <nav className="sk-nav__links" aria-label="SK-image">
          <Link href="/sk-image" className="sk-nav__link" aria-current={!addActive ? "page" : undefined}>Products</Link>
          <Link href="/sk-image/add" className="sk-nav__link" aria-current={addActive ? "page" : undefined}>Add Product</Link>
          <button type="button" className="sk-nav__link" onClick={logout}>Logout</button>
        </nav>
      </div>
    </header>
  );
}
