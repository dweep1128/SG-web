// Gate for the SK-image admin portal (owner + staff roles). Also refreshes the Supabase session cookie on every
// portal request. A signed-in user WITHOUT a portal role counts as signed out.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { roleOf } from "@/lib/sk-image";
import { COOKIE_OPTIONS, SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase";

const LOGIN = "/sk-image/login";
const HOME = "/sk-image";

export async function middleware(req: NextRequest) {
  // CSRF: portal writes must come from this site. (Auth cookies are SameSite=Lax too; this is the second lock.)
  const origin = req.headers.get("origin");
  if (req.method !== "GET" && req.method !== "HEAD" && origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  }

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const signedIn = roleOf(data?.claims) !== null;
  const { pathname, search } = req.nextUrl;

  if (pathname === LOGIN) return signedIn ? NextResponse.redirect(new URL(HOME, req.url)) : res;
  if (signedIn) return res;
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL(LOGIN, req.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/sk-image/:path*", "/api/sk-image/:path*"] };
