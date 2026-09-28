"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { browserSupabase } from "@/lib/supabase";
import { Button, Input } from "../ui";

// Email + password only. Accounts are created in the Supabase dashboard; there is no signup.
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { error } = await browserSupabase().auth.signInWithPassword({ email: String(fd.get("email")).trim(), password: String(fd.get("password")) });
    if (error) {
      setBusy(false);
      setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
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
