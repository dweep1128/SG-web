// Plain GET form — works without JS. Phase 4 upgrades this into the autocomplete combobox.
export function SearchBox({ id, size = "md", defaultValue }: { id: string; size?: "md" | "lg"; defaultValue?: string }) {
  return (
    <form action="/search" role="search" className={`search search--${size}`}>
      <label htmlFor={id} className="visually-hidden">Search parts by name, code or HSN</label>
      <input id={id} name="q" type="search" className="search__input" placeholder="Search parts, codes, HSN…" defaultValue={defaultValue} autoComplete="off" enterKeyHint="search" />
      <button type="submit" className="search__submit" aria-label="Search">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      </button>
    </form>
  );
}
