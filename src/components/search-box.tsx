"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { formatPrice, partHref, STOCK_LABEL } from "@/lib/catalog-types";
import { buildIndex, search, type SearchDoc, type SearchIndex } from "@/lib/search";
import { decodeSearchIndex } from "@/lib/search-index";
import { Highlight } from "./highlight";

const MAX_SUGGESTIONS = 6;
const DEBOUNCE_MS = 120;

// One fetch per page load, shared by every search box on the page. Rejected promise is dropped so a retry can happen.
let indexPromise: Promise<SearchIndex<SearchDoc>> | null = null;
function loadIndex() {
  indexPromise ??= fetch("/api/search-index")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`search index ${r.status}`))))
    .then((rows) => buildIndex(decodeSearchIndex(rows)))
    .catch((e) => {
      indexPromise = null;
      throw e;
    });
  return indexPromise;
}

const isTypingTarget = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const searchHref = (q: string) => `/search?q=${encodeURIComponent(q.trim())}`;

// Progressive enhancement: without JS this is a plain GET form to /search.
export function SearchBox({ id, size = "md", defaultValue = "", shortcut = false }: { id: string; size?: "md" | "lg"; defaultValue?: string; shortcut?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `${useId()}-list`;
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<SearchDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const q = value.trim();
  const optionCount = results.length + 1; // + "See all results"

  useEffect(() => {
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const index = await loadIndex();
        if (!cancelled) setResults(search(index, q, MAX_SUGGESTIONS));
      } catch {
        if (!cancelled) setResults([]); // form submit to /search still works
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut]);

  function go(href: string) {
    if (href.startsWith("/parts/")) setValue(""); // a picked part is done; a results page keeps the query to refine
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    router.push(href);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (q) go(searchHref(q));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!q) return;
      e.preventDefault();
      setOpen(true);
      // Positions: -1 (the input itself), 0..optionCount-1. Wraps both ways.
      const step = e.key === "ArrowDown" ? 1 : -1;
      const positions = optionCount + 1;
      setActive((a) => ((a + 1 + step + positions) % positions) - 1);
    } else if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault();
      go(active < results.length ? partHref(results[active].code) : searchHref(q));
    } else if (e.key === "Escape") {
      if (open) setOpen(false);
      else setValue("");
      setActive(-1);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const expanded = open && q.length > 0;
  const activeId = expanded && active >= 0 ? `${listId}-${active}` : undefined;

  return (
    <form action="/search" role="search" className={`search search--${size}`} onSubmit={onSubmit}>
      <label htmlFor={id} className="visually-hidden">Search parts by name, code or HSN</label>
      <input
        ref={inputRef}
        id={id}
        name="q"
        type="search"
        className="search__input"
        placeholder="Search parts, codes, HSN…"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          loadIndex().catch(() => {});
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {shortcut && !value && <kbd className="search__kbd" aria-hidden="true">/</kbd>}
      <button type="submit" className="search__submit" aria-label="Search">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      </button>

      <ul id={listId} role="listbox" aria-label="Suggestions" className="suggest" hidden={!expanded} onMouseDown={(e) => e.preventDefault() /* keep focus in the input */}>
        {loading && results.length === 0 && <li className="suggest__status">Searching…</li>}
        {!loading && results.length === 0 && <li className="suggest__status">No quick matches. Press Enter to search everything.</li>}
        {results.map((d, i) => (
          <li key={d.code} id={`${listId}-${i}`} role="option" aria-selected={i === active} className="suggest__item" onClick={() => go(partHref(d.code))} onMouseMove={() => setActive(i)}>
            <span className="suggest__name"><Highlight text={d.name} query={q} /></span>
            <span className="suggest__meta">
              <span className="mono">#{d.code}</span>
              <span>{formatPrice(d.price)}</span>
              <span className={`suggest__stock suggest__stock--${d.stock}`}>{STOCK_LABEL[d.stock]}</span>
            </span>
          </li>
        ))}
        <li id={`${listId}-${results.length}`} role="option" aria-selected={active === results.length} className="suggest__all" onClick={() => go(searchHref(q))} onMouseMove={() => setActive(results.length)}>
          See all results for &ldquo;{q}&rdquo; →
        </li>
      </ul>
      <span className="visually-hidden" role="status" aria-live="polite">{expanded && !loading ? `${results.length} suggestions` : ""}</span>
    </form>
  );
}
