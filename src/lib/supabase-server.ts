// Server-side Supabase client acting as the signed-in staff user (RLS applies). Server components + route handlers only.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase";

export async function serverSupabase() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server components can't write cookies; middleware already refreshed the session on this request.
        }
      },
    },
  });
}

// Route handlers re-check the session themselves: middleware is the first gate, not the only one.
export async function requireStaff() {
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ? supabase : null;
}
