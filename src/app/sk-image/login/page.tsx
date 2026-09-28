import { LoginForm } from "@/components/sk-image/login-form";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  // Only ever bounce back into the portal (no open redirect).
  const target = typeof next === "string" && next.startsWith("/sk-image") ? next : "/sk-image";
  return (
    <div className="shell page sk-login">
      <div className="card sk-login__card">
        <p className="eyebrow">Staff only</p>
        <h1 className="sk-title">SK-image</h1>
        <LoginForm next={target} />
      </div>
    </div>
  );
}
