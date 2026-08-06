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
  DesktopOverlayStatus,
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
import { ResourcePicker } from "../components/ResourcePicker";

export function TrackerView({ onChange }: { onChange: () => void }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Loadable<ResourceDetail>>({
    data: null,
    loading: false,
    error: null
  });
  const [form, setForm] = useState({
    text: "",
    termType: "word" as ResourceTerm["termType"],
    reading: "",
    meaning: "",
    notes: ""
  });
  const [wordLookupQuery, setWordLookupQuery] = useState("");
  const [wordLookup, setWordLookup] = useState<Loadable<Word[]>>({
    data: [],
    loading: false,
    error: null
  });
  const [trackingWordId, setTrackingWordId] = useState<number | null>(null);
  const [savingTerm, setSavingTerm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadResources();
  }, []);

  useEffect(() => {
    if (selectedResourceId) {
      void loadDetail(selectedResourceId);
    }
  }, [selectedResourceId]);

  useEffect(() => {
    const query = wordLookupQuery.trim();
    if (!query) {
      setWordLookup({ data: [], loading: false, error: null });
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setWordLookup((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await api.words(query);
        if (!cancelled) {
          setWordLookup({ data: response.items, loading: false, error: null });
        }
      } catch (requestError) {
        if (!cancelled) {
          setWordLookup({
            data: [],
            loading: false,
            error: requestError instanceof Error ? requestError.message : "Dictionary lookup failed"
          });
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [wordLookupQuery]);

  async function loadResources() {
    try {
      const response = await api.resources("?limit=1");
      setResources(response.items);
      setSelectedResourceId((current) => current ?? response.items[0]?.id ?? null);
    } catch (requestError) {
      setDetail((current) => ({ ...current, error: requestError instanceof Error ? requestError.message : "Could not load resources" }));
    }
  }

  async function loadDetail(resourceId: number) {
    setDetail((current) => ({ ...current, loading: true, error: null }));
    try {
      setDetail({ data: await api.resource(resourceId), loading: false, error: null });
    } catch (requestError) {
      setDetail({
        data: null,
        loading: false,
        error: requestError instanceof Error ? requestError.message : "Could not load resource tracker"
      });
    }
  }

  async function addTerm(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedResourceId || !form.text.trim()) {
      return;
    }

    setSavingTerm(true);
    setMessage(null);
    try {
      await api.addResourceTerm(selectedResourceId, {
        termType: form.termType, text: form.text.trim(), reading: form.reading.trim() || null,
        meaning: form.meaning.trim() || null, notes: form.notes.trim() || null, source: "manual", frequency: 1
      });
      setForm((current) => ({ ...current, text: "", reading: "", meaning: "", notes: "" }));
      setMessage("Term saved to this resource.");
      await loadDetail(selectedResourceId);
      onChange();
    } catch (requestError) {
      setDetail((current) => ({ ...current, error: requestError instanceof Error ? requestError.message : "Could not save term" }));
    } finally {
      setSavingTerm(false);
    }
  }

  async function trackDictionaryWord(word: Word) {
    if (!selectedResourceId) {
      return;
    }

    setTrackingWordId(word.id);
    setMessage(null);
    try {
      await api.addResourceWord(selectedResourceId, word.id, { frequency: 1 });
      setMessage(`${wordDisplay(word)} added to this resource.`);
      await loadDetail(selectedResourceId);
      onChange();
    } catch (requestError) {
      setWordLookup((current) => ({
        ...current,
        error: requestError instanceof Error ? requestError.message : "Could not track this word"
      }));
    } finally {
      setTrackingWordId(null);
    }
  }

  const terms = detail.data?.terms ?? [];
  const dictionaryWords = detail.data?.words ?? [];
  const kanjiCount = terms.filter((term) => term.termType === "kanji").length;
  const wordCount = terms.filter((term) => term.termType === "word").length + dictionaryWords.length;
  const selectedResource = resources.find((resource) => resource.id === selectedResourceId);
  const trackedWordIds = new Set(dictionaryWords.map((word) => word.id));
  const trackedCount = terms.length + dictionaryWords.length;

  return (
    <section className="tracker-layout">
      <aside className="panel form-panel">
        <div className="panel-heading">
          <h2>Tracker</h2>
          <span>{resources.length} resources</span>
        </div>
        <label>
          Resource
          <ResourcePicker value={selectedResourceId} onChange={(id, resource) => {
            setSelectedResourceId(id);
            if (resource) setResources((current) => [...new Map([...current, resource].map((item) => [item.id, item])).values()]);
          }} />
        </label>
        <div className="tracker-metrics">
          <article>
            <strong>{trackedCount}</strong>
            <span>Total terms</span>
          </article>
          <article>
            <strong>{kanjiCount}</strong>
            <span>Kanji</span>
          </article>
          <article>
            <strong>{wordCount}</strong>
            <span>Words</span>
          </article>
        </div>
        <section className="tracker-lookup-panel">
          <div>
            <span className="eyebrow">Dictionary lookup</span>
            <h3>Find and track a word</h3>
            <p className="helper-text">Search Japanese, kana, romaji, or English, then add the JMdict entry to this resource.</p>
          </div>
          <div className="searchbar tracker-word-search">
            <Search size={18} />
            <input
              value={wordLookupQuery}
              onChange={(event) => setWordLookupQuery(event.target.value)}
              placeholder="nihon, にほん, 日本, Japan"
              disabled={!selectedResourceId}
            />
            {wordLookupQuery && (
              <button type="button" aria-label="Clear word lookup" onClick={() => setWordLookupQuery("")}>
                <X size={16} />
              </button>
            )}
          </div>
          {wordLookup.error && <p className="error-text">{wordLookup.error}</p>}
          {wordLookup.loading ? (
            <EmptyState title="Searching dictionary" detail="Reading word entries." />
          ) : wordLookupQuery.trim() && wordLookup.data && wordLookup.data.length === 0 ? (
            <EmptyState title="No matching words" detail="Try kana, kanji, romaji, or an English gloss." />
          ) : wordLookup.data && wordLookup.data.length > 0 ? (
            <div className="tracker-word-results">
              {wordLookup.data.slice(0, 6).map((word) => {
                const tracked = trackedWordIds.has(word.id);
                return (
                  <article className="tracker-word-result" key={word.id}>
                    <div>
                      <strong>{wordDisplay(word)}</strong>
                      <span>{word.readings.join(" · ") || "-"}</span>
                      <small>{word.glosses.slice(0, 2).join("; ") || "No gloss"}</small>
                    </div>
                    <button
                      className="mini-button"
                      type="button"
                      disabled={!selectedResourceId || tracked || trackingWordId === word.id}
                      onClick={() => void trackDictionaryWord(word)}
                    >
                      <Plus size={14} />
                      {tracked ? "Tracked" : trackingWordId === word.id ? "Adding" : "Track"}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
        <form className="inline-form" onSubmit={(event) => void addTerm(event)}>
          <div>
            <span className="eyebrow">Manual fallback</span>
            <h3>Add a custom term</h3>
          </div>
          <label>
            Term
            <input
              value={form.text}
              onChange={(event) => setForm({ ...form, text: event.target.value })}
              placeholder="冒険"
            />
          </label>
          <div className="form-grid">
            <label>
              Type
              <select
                value={form.termType}
                onChange={(event) =>
                  setForm({ ...form, termType: event.target.value as ResourceTerm["termType"] })
                }
              >
                <option value="word">Word</option>
                <option value="kanji">Kanji</option>
                <option value="phrase">Phrase</option>
                <option value="kana">Kana</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label>
              Reading
              <input
                value={form.reading}
                onChange={(event) => setForm({ ...form, reading: event.target.value })}
                placeholder="ぼうけん"
              />
            </label>
          </div>
          <label>
            Meaning
            <input
              value={form.meaning}
              onChange={(event) => setForm({ ...form, meaning: event.target.value })}
              placeholder="adventure"
            />
          </label>
          <label>
            Notes
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </label>
          <button className="primary-button" type="submit" disabled={!selectedResourceId || savingTerm}>
            <Save size={17} />
            {savingTerm ? "Saving..." : "Save term"}
          </button>
          {message && <p className="success-text">{message}</p>}
        </form>
      </aside>

      <section className="panel">
        <div className="panel-heading">
          <h2>{selectedResource?.name ?? "Resource Terms"}</h2>
          <span>{detail.loading ? "loading" : `${trackedCount} tracked`}</span>
        </div>
        {detail.error && <p className="error-text">{detail.error}</p>}
        {!selectedResourceId ? (
          <EmptyState title="Pick a resource" detail="Tracked OCR terms and manual vocabulary are grouped by source." />
        ) : trackedCount === 0 ? (
          <EmptyState title="No terms yet" detail="Look up a dictionary word, use Capture, or add a term manually." />
        ) : (
          <div className="tracked-resource-content">
            {dictionaryWords.length > 0 && (
              <section>
                <div className="section-subheading">
                  <h3>Dictionary words</h3>
                  <span>{dictionaryWords.length}</span>
                </div>
                <div className="resource-word-grid">
                  {dictionaryWords.map((word) => (
                    <article className="word-card" key={word.id}>
                      <div>
                        <strong>{wordDisplay(word)}</strong>
                        <span>#{word.entryId}</span>
                      </div>
                      <p>{word.readings.join(" · ") || "-"}</p>
                      <small>{word.glosses.slice(0, 3).join("; ") || "No gloss"}</small>
                      {word.resource?.frequency ? <span>{word.resource.frequency}x in resource</span> : null}
                    </article>
                  ))}
                </div>
              </section>
            )}
            {terms.length > 0 && (
              <section>
                <div className="section-subheading">
                  <h3>Captured and manual terms</h3>
                  <span>{terms.length}</span>
                </div>
                <div className="term-table">
                  {terms.map((term) => (
                    <article className="term-row" key={term.id}>
                      <div>
                        <span>{term.termType}</span>
                        <strong>{term.text}</strong>
                      </div>
                      <span>{term.reading || "-"}</span>
                      <span>{term.meaning || term.notes || "-"}</span>
                      <small>{term.frequency}x</small>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </section>
    </section>
  );
}

function wordDisplay(word: Word) {
  return word.kanjiForms[0] ?? word.readings[0] ?? `#${word.entryId}`;
}
