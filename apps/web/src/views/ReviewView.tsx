import { useEffect, useState } from "react";
import { Check, Pause, RotateCcw, X } from "lucide-react";
import { api } from "../api";
import { Pagination } from "../components/Pagination";
import { ResourcePicker } from "../components/ResourcePicker";
import { useAsyncTask } from "../hooks/useAsyncTask";
import type { KnowledgeItem, Page } from "../types";
import { EmptyState } from "./shared";

const pageSize = 20;
const emptyPage: Page<KnowledgeItem> = { items: [], page: { limit: pageSize, offset: 0, total: 0 } };

export function ReviewView() {
  const [page, setPage] = useState(emptyPage);
  const [resourceId, setResourceId] = useState<number | null>(null);
  const [itemType, setItemType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const task = useAsyncTask();

  useEffect(() => { void load(0); }, [resourceId, itemType]);
  async function load(offset: number) {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
      if (resourceId) params.set("resourceId", String(resourceId));
      if (itemType) params.set("itemType", itemType);
      setPage(await api.dueReviews(`?${params}`));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not load reviews"); }
    finally { setLoading(false); }
  }
  async function review(item: KnowledgeItem, correct: boolean) {
    const result = await task.run(() => api.submitReview({ itemType: item.itemType, itemKey: item.itemKey, correct }));
    if (result) await load(page.page.offset);
  }
  async function action(item: KnowledgeItem, value: "suspend" | "reset" | "master") {
    const result = await task.run(() => api.reviewAction({ itemType: item.itemType, itemKey: item.itemKey, action: value }));
    if (result) await load(page.page.offset);
  }

  const item = page.items[0];
  return <section className="review-view">
    <section className="panel review-toolbar">
      <label>Resource<ResourcePicker value={resourceId} allowNone onChange={(id) => setResourceId(id)} /></label>
      <label>Item type<select value={itemType} onChange={(event) => setItemType(event.target.value)}><option value="">All types</option><option value="kanji">Kanji</option><option value="word">Words</option><option value="phrase">Phrases</option><option value="kana">Kana</option><option value="custom_vocabulary">Custom vocabulary</option></select></label>
    </section>
    {error && <p className="error-text" role="alert">{error}</p>}{task.error && <p className="error-text" role="alert">{task.error}</p>}
    <section className="panel review-session" aria-busy={loading || task.running}>
      {loading ? <p>Loading due reviews...</p> : !item ? <EmptyState title="Review queue clear" detail="Nothing matching these filters is due right now." /> : <>
        <div className="review-card"><span className="resource-type">{item.itemType.replace("_", " ")}</span><strong>{item.itemKey}</strong><small>Stage {item.stage} | {item.lapses} lapses</small></div>
        <div className="review-actions"><button type="button" className="danger-button" disabled={task.running} onClick={() => void review(item, false)}><X size={18} /> Again</button><button type="button" className="primary-button" disabled={task.running} onClick={() => void review(item, true)}><Check size={18} /> Correct</button></div>
        <div className="button-row"><button type="button" className="secondary-button" disabled={task.running} onClick={() => void action(item, "suspend")}><Pause size={16} /> Suspend</button><button type="button" className="secondary-button" disabled={task.running} onClick={() => void action(item, "reset")}><RotateCcw size={16} /> Reset</button><button type="button" className="secondary-button" disabled={task.running} onClick={() => void action(item, "master")}><Check size={16} /> Master</button></div>
      </>}
      <Pagination {...page.page} onChange={(offset) => void load(offset)} />
    </section>
  </section>;
}
