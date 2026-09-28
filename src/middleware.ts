// Gate for the SK-image staff portal. Also refreshes the Supabase session cookie on every portal request.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase";

const LOGIN = "/sk-image/login";
const HOME = "/sk-image";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
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
  const signedIn = !!data?.claims;
  const { pathname, search } = req.nextUrl;

  if (pathname === LOGIN) return signedIn ? NextResponse.redirect(new URL(HOME, req.url)) : res;
  if (signedIn) return res;
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL(LOGIN, req.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/sk-image/:path*", "/api/sk-image/:path*"] };
