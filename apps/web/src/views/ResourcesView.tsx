import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  Boxes,
  Brain,
  CheckCircle2,
  ClipboardList,
  Crosshair,
  Database,
  FileImage,
  Gauge,
  Home,
  Keyboard,
  Mic,
  Monitor,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Target,
  Trophy,
  Upload,
  Wrench,
  X
} from "lucide-react";
import { api } from "../api";
import {
  EventSourceBars,
  KanjiKnowledgeNetwork,
  KanjiXpTimeline,
  KnowledgeCompositionDonut,
  TopKanjiBarChart
} from "../KnowledgeVisuals";
import type {
  DataSummary,
  Dashboard,
  ImportJob,
  Kanji,
  KanjiGraph,
  KnowledgeItem,
  KnowledgeSummary,
  OcrResult,
  QuizAnswerPayload,
  QuizQuestion,
  QuizSession,
  RecognitionResult,
  Resource,
  ResourceDetail,
  ResourceTerm,
  RuntimeDoctor,
  SentenceExample,
  ServiceHealth,
  Word
} from "../types";

import { EmptyState, emptyDashboard, type Loadable, type View } from "./shared";
import { Pagination } from "../components/Pagination";

export function ResourcesView({ onChange }: { onChange: () => void }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState(() => resourceSearchParams().get("q") ?? "");
  const [page, setPage] = useState({ limit: 20, offset: Number(resourceSearchParams().get("offset") ?? 0) || 0, total: 0 });
  const [form, setForm] = useState({
    name: "",
    type: "manga",
    status: "in_progress",
    difficultyLevel: "intermediate",
    tags: "",
    description: ""
  });

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadResources(); }, 200);
    return () => window.clearTimeout(timer);
  }, [page.offset, search]);

  async function loadResources() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(page.limit), offset: String(page.offset) });
      if (search.trim()) params.set("search", search.trim());
      replaceResourceLocation(search, page.offset);
      const result = await api.resources(`?${params}`);
      setResources(result.items);
      setPage(result.page);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load resources");
    } finally {
      setLoading(false);
    }
  }

  async function createResource(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.createResource({
        name: form.name.trim(), type: form.type, status: form.status,
        difficultyLevel: form.difficultyLevel, description: form.description.trim() || null,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      });
      setForm((current) => ({ ...current, name: "", tags: "", description: "" }));
      if (page.offset !== 0) setPage((current) => ({ ...current, offset: 0 })); else await loadResources();
      onChange();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create resource");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="split-view">
      <form className="panel form-panel" onSubmit={(event) => void createResource(event)}>
        <div className="panel-heading">
          <h2>Add Resource</h2>
        </div>
        <label>
          Name
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Dragon Quest III"
          />
        </label>
        <div className="form-grid">
          <label>
            Type
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              <option value="manga">Manga</option>
              <option value="video_game">Video game</option>
              <option value="book">Book</option>
              <option value="anime">Anime</option>
              <option value="website">Website</option>
              <option value="podcast">Podcast</option>
            </select>
          </label>
          <label>
            Status
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="on_hold">On hold</option>
            </select>
          </label>
        </div>
        <label>
          Difficulty
          <select
            value={form.difficultyLevel}
            onChange={(event) => setForm({ ...form, difficultyLevel: event.target.value })}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <label>
          Tags
          <input
            value={form.tags}
            onChange={(event) => setForm({ ...form, tags: event.target.value })}
            placeholder="fantasy, game"
          />
        </label>
        <label>
          Notes
          <textarea
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={4}
          />
        </label>
        <button className="primary-button" type="submit" disabled={submitting}>
          <Plus size={17} />
          {submitting ? "Adding..." : "Add"}
        </button>
      </form>

      <section className="panel">
        <div className="panel-heading">
          <h2>Library</h2>
          <span>{loading ? "loading" : `${page.total} resources`}</span>
        </div>
        <div className="searchbar"><Search size={18} /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage((current) => ({ ...current, offset: 0 })); }} placeholder="Search library" aria-label="Search library" /></div>
        {error && <p className="error-text" role="alert">{error}</p>}
        {resources.length === 0 ? (
          <EmptyState title="Your shelf is empty" detail="Create a resource to start attaching words, kanji, OCR captures, and notes." />
        ) : (
          <div className="resource-grid">
            {resources.map((resource) => (
              <article className="resource-card" key={resource.id}>
                <div>
                  <span className="resource-type">{resource.type.replace("_", " ")}</span>
                  <h3>{resource.name}</h3>
                  <p>{resource.description || "No notes yet."}</p>
                </div>
                <div className="tag-list">
                  {resource.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <a className="resource-open-link" href={resourceTrackerHref(resource.id)}>
                  <FileImage size={16} aria-hidden="true" />
                  View images and terms
                </a>
              </article>
            ))}
          </div>
        )}
        <Pagination {...page} onChange={(offset) => setPage((current) => ({ ...current, offset }))} />
      </section>
    </section>
  );
}

function resourceTrackerHref(resourceId: number) {
  const route = `/tracker?resource=${resourceId}`;
  return window.location.protocol === "file:" ? `#${route}` : route;
}

function resourceSearchParams() {
  const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
  return new URLSearchParams(hashQuery || window.location.search);
}

function replaceResourceLocation(search: string, offset: number) {
  const query = new URLSearchParams({
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(offset ? { offset: String(offset) } : {})
  }).toString();
  const route = `/resources${query ? `?${query}` : ""}`;
  window.history.replaceState(null, "", window.location.protocol === "file:" ? `#${route}` : route);
}
