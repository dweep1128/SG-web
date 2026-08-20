"use client";
import { FormEvent, useMemo, useState } from "react";
import { ScooterModel } from "@/lib/types";
import { useRouter } from "next/navigation";

export function ProductFinder({ models }: { models: ScooterModel[] }) {
  const router = useRouter(); const brands = useMemo(() => [...new Set(models.map(model => model.brand))], [models]); const [brand, setBrand] = useState(""); const [model, setModel] = useState(""); const [query, setQuery] = useState(""); const visibleModels = models.filter(item => item.brand === brand);
  function submit(event: FormEvent) { event.preventDefault(); const params = new URLSearchParams(); if (query.trim()) params.set("q", query.trim()); if (model) params.set("model", model); router.push(`/products?${params}`); }
  return <section className="finder" id="find-part"><div className="shell finder-grid"><div><span className="eyebrow">PARTS FINDER</span><h2>What part are you looking for?</h2><p>Search a part name or SKU—or filter the catalogue by scooter model.</p></div><form onSubmit={submit}><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search part name, SKU or part number"/><button>Search</button></div><div className="filter-row"><select value={brand} onChange={event => { setBrand(event.target.value); setModel(""); }}><option value="">Select scooter brand</option>{brands.map(item => <option key={item}>{item}</option>)}</select><select disabled={!brand} value={model} onChange={event => setModel(event.target.value)}><option value="">Select model</option>{visibleModels.map(item => <option value={item.id} key={item.id}>{item.model}{item.model_year ? ` · ${item.model_year}` : ""}</option>)}</select><button className="btn btn-primary">Show compatible parts →</button></div></form></div></section>;
}
