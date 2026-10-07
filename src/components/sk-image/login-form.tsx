"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { roleOf } from "@/lib/sk-image";
import { browserSupabase } from "@/lib/supabase";
import { Button, Input } from "../ui";

// Email + password only (Supabase Auth: bcrypt-hashed passwords, per-IP sign-in rate limit). Accounts are created
// with scripts/admin-user.mjs or the Supabase dashboard; there is no signup.
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const supabase = browserSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email: String(fd.get("email")).trim(), password: String(fd.get("password")) });
    if (error) {
      setBusy(false);
      setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.status === 429 ? "Too many attempts. Wait a few minutes and try again." : error.message);
      return;
    }
    // A valid login without an owner/staff role gets nothing (middleware + RLS agree); say so instead of looping.
    if (!roleOf(data.user)) {
      await supabase.auth.signOut();
      setBusy(false);
      setError("This account has no portal access. Ask the owner to add you.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form className="sk-form" onSubmit={onSubmit}>
      <Input id="sk-email" name="email" type="email" label="Email" autoComplete="username" inputMode="email" required />
      <Input id="sk-password" name="password" type="password" label="Password" autoComplete="current-password" required />
      {error && <p className="sk-form__error" role="alert">{error}</p>}
      <Button type="submit" variant="primary" size="lg" block disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
