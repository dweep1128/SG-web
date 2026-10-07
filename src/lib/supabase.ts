// Supabase env + browser client. Publishable key only (either env name); never the service role key.
import { createBrowserClient } from "@supabase/ssr";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Auth cookies: Secure in production (HTTPS only), SameSite=Lax (library default). Not httpOnly: the browser client
// needs to read the session — the trade-off @supabase/ssr is built on; CSP is the XSS guard.
export const COOKIE_OPTIONS = { secure: process.env.NODE_ENV === "production" };

// Cookie-backed session shared with middleware and server components. createBrowserClient is a singleton.
export const browserSupabase = () => createBrowserClient(SUPABASE_URL, SUPABASE_KEY, { cookieOptions: COOKIE_OPTIONS });
