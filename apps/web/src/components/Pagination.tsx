import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ limit, offset, total, onChange }: { limit: number; offset: number; total: number; onChange: (offset: number) => void }) {
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);
  return <nav className="pagination" aria-label="Pagination">
    <button type="button" className="icon-button" title="Previous page" aria-label="Previous page" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}><ChevronLeft size={18} /></button>
    <span>{first}-{last} of {total}</span>
    <button type="button" className="icon-button" title="Next page" aria-label="Next page" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}><ChevronRight size={18} /></button>
  </nav>;
}
