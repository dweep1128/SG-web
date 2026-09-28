// Supabase env + browser client. Publishable key only (either env name); never the service role key.
import { createBrowserClient } from "@supabase/ssr";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Cookie-backed session shared with middleware and server components. createBrowserClient is a singleton.
export const browserSupabase = () => createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
