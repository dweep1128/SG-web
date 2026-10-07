// Server-side Supabase client acting as the signed-in staff user (RLS applies). Server components + route handlers only.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { roleOf, type Role } from "./sk-image";
import { COOKIE_OPTIONS, SUPABASE_KEY, SUPABASE_URL } from "./supabase";

export async function serverSupabase() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookieOptions: COOKIE_OPTIONS,
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

/** The signed-in user's portal role, or null (signed out, or signed in without a role). */
export async function currentRole(): Promise<Role | null> {
  const { data } = await (await serverSupabase()).auth.getClaims();
  return roleOf(data?.claims);
}

// Route handlers re-check the session themselves: middleware is the first gate, not the only one.
export async function requireStaff(allowed: Role[] = ["owner", "staff"]) {
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getClaims();
  const role = roleOf(data?.claims);
  return role && allowed.includes(role) ? supabase : null;
}
