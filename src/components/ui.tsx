// Design-system primitives. Server-safe (no hooks) so both server and client components can use them.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { STOCK_LABEL, type StockState } from "@/lib/catalog-types";

type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "whatsapp";
type ButtonSize = "sm" | "md" | "lg";
type ButtonStyle = { variant?: ButtonVariant; size?: ButtonSize; block?: boolean };

function buttonClass({ variant = "secondary", size = "md", block }: ButtonStyle, extra?: string): string {
  return ["btn", variant !== "secondary" && `btn--${variant}`, size !== "md" && `btn--${size}`, block && "btn--block", extra].filter(Boolean).join(" ");
}

export function Button({ variant, size, block, className, type = "button", ...rest }: ButtonStyle & ComponentProps<"button">) {
  return <button type={type} className={buttonClass({ variant, size, block }, className)} {...rest} />;
}

export function ButtonLink({ variant, size, block, className, ...rest }: ButtonStyle & ComponentProps<typeof Link>) {
  return <Link className={buttonClass({ variant, size, block }, className)} {...rest} />;
}

// External links (wa.me). A null href renders a disabled button so a missing env var never produces a broken link.
export function ExternalButton({ variant, size, block, className, href, children, ...rest }: ButtonStyle & Omit<ComponentProps<"a">, "href"> & { href: string | null }) {
  if (!href) {
    return <span className={buttonClass({ variant, size, block }, className)} aria-disabled="true" title="WhatsApp number not configured">{children}</span>;
  }
  return <a className={buttonClass({ variant, size, block }, className)} href={href} target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>;
}

export function Badge({ tone, plain, children }: { tone?: "in" | "low" | "ask"; plain?: boolean; children: ReactNode }) {
  return <span className={["badge", tone && tone !== "ask" && `badge--${tone}`, plain && "badge--plain"].filter(Boolean).join(" ")}>{children}</span>;
}

export function StockBadge({ stock }: { stock: StockState }) {
  return <Badge tone={stock}>{STOCK_LABEL[stock]}</Badge>;
}

export function CodeTag({ code }: { code: number | string }) {
  return <span className="code-tag" aria-label={`Item code ${code}`}>{code}</span>;
}

type FieldProps = { label: string; hint?: string; id: string };

export function Input({ label, hint, id, className, ...rest }: FieldProps & ComponentProps<"input">) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <input id={id} className={["input", className].filter(Boolean).join(" ")} aria-describedby={hint ? `${id}-hint` : undefined} {...rest} />
      {hint && <span className="field__hint" id={`${id}-hint`}>{hint}</span>}
    </div>
  );
}

export function Textarea({ label, hint, id, ...rest }: FieldProps & ComponentProps<"textarea">) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <textarea id={id} className="input" aria-describedby={hint ? `${id}-hint` : undefined} {...rest} />
      {hint && <span className="field__hint" id={`${id}-hint`}>{hint}</span>}
    </div>
  );
}

export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div className={["card", className].filter(Boolean).join(" ")} {...rest} />;
}

export function Skeleton({ width = "100%", height = 16, className }: { width?: number | string; height?: number | string; className?: string }) {
  return <div className={["skeleton", className].filter(Boolean).join(" ")} style={{ width, height }} aria-hidden="true" />;
}

export function EmptyState({ icon, title, children, actions }: { icon?: ReactNode; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon">{icon}</div>}
      <h2>{title}</h2>
      {children && <div className="empty__body">{children}</div>}
      {actions && <div className="empty__actions">{actions}</div>}
    </div>
  );
}
