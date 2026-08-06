import { useEffect, useState } from "react";
import { api } from "../api";
import type { Resource } from "../types";

const pageSize = 25;

export function ResourcePicker({ value, onChange, allowNone = false }: { value: number | null; onChange: (id: number | null, resource?: Resource) => void; allowNone?: boolean }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Resource[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(0, true); }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function load(nextOffset: number, replace: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(nextOffset) });
      if (query.trim()) params.set("search", query.trim());
      const page = await api.resources(`?${params}`);
      setItems((current) => {
        const merged = replace ? page.items : [...current, ...page.items];
        return [...new Map(merged.map((item) => [item.id, item])).values()];
      });
      setOffset(nextOffset);
      setTotal(page.page.total);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load resources");
    } finally {
      setLoading(false);
    }
  }

  return <div className="resource-picker">
    <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources" aria-label="Search resources" />
    <select value={value ?? ""} onChange={(event) => {
      const id = event.target.value ? Number(event.target.value) : null;
      onChange(id, items.find((item) => item.id === id));
    }}>
      {allowNone && <option value="">No resource</option>}
      {!allowNone && <option value="">Select a resource</option>}
      {value && !items.some((item) => item.id === value) && <option value={value}>Selected resource #{value}</option>}
      {items.map((resource) => <option value={resource.id} key={resource.id}>{resource.name}</option>)}
    </select>
    <div className="picker-status">
      <small>{loading ? "Loading..." : `${items.length} of ${total}`}</small>
      {items.length < total && <button type="button" className="secondary-button" disabled={loading} onClick={() => void load(offset + pageSize, false)}>Load more</button>}
    </div>
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>;
}
