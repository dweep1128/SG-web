"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { refreshSite, type Source } from "@/lib/sk-image";
import { browserSupabase } from "@/lib/supabase";
import { toast, toastError } from "../toast";

const MAX_NAME = 200;
const TARGET = { busy: { table: "busy_items", keyColumn: "busy_code" }, manual: { table: "products_manual", keyColumn: "id" } } as const;

type Props = { source: Source; productKey: string; value: string | null; sourceName: string; id: string };

// Saves on blur / Enter, only if the text changed. Empty clears the override (the site falls back to the BUSY name).
// Nothing is kept on this device: no localStorage, autofill off. The write goes straight to Supabase under the staff session.
export function DisplayNameInput({ source, productKey, value, sourceName, id }: Props) {
  const router = useRouter();
  const [text, setText] = useState(value ?? "");
  const [saved, setSaved] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const next = text.trim().slice(0, MAX_NAME);
    setText(next);
    if (next === saved) return;
    setSaving(true);
    const { table, keyColumn } = TARGET[source];
    const { error } = await browserSupabase().from(table).update({ display_name: next || null }).eq(keyColumn, productKey);
    setSaving(false);
    if (error) return toastError(error.message);
    setSaved(next);
    refreshSite();
    toast(next ? "Display name saved" : "Display name cleared");
    router.refresh();
  }

  return (
    <div className="field sk-dn">
      <label className="field__label" htmlFor={id}>Display name</label>
      <input
        id={id}
        className="input"
        value={text}
        maxLength={MAX_NAME}
        placeholder={sourceName}
        autoComplete="off"
        autoCapitalize="sentences"
        enterKeyHint="done"
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <span className="field__hint">{source === "busy" ? "BUSY name" : "Product name"}: {sourceName}</span>
    </div>
  );
}
