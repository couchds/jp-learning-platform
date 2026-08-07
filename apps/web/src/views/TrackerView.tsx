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
  SavedGrammar,
  SentenceExample,
  ServiceHealth,
  Word
} from "../types";

import { EmptyState, emptyDashboard, type Loadable, type View } from "./shared";
import { ResourcePicker } from "../components/ResourcePicker";
import { ResourceImageBrowser } from "../components/ResourceImageBrowser";

export function TrackerView({ onChange }: { onChange: () => void }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(() => resourceIdFromLocation());
  const [detail, setDetail] = useState<Loadable<ResourceDetail>>({
    data: null,
    loading: false,
    error: null
  });
  const [grammar, setGrammar] = useState<SavedGrammar[]>([]);
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
      const [resourceDetail, grammarResponse] = await Promise.all([
        api.resource(resourceId),
        api.resourceGrammar(resourceId)
      ]);
      setDetail({ data: resourceDetail, loading: false, error: null });
      setGrammar(grammarResponse.items);
    } catch (requestError) {
      setGrammar([]);
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

  async function deleteImage(imageId: number) {
    if (!selectedResourceId) return;
    setMessage(null);
    try {
      await api.deleteResourceImage(selectedResourceId, imageId);
      await loadDetail(selectedResourceId);
      setMessage("Saved image deleted.");
      onChange();
    } catch (requestError) {
      setDetail((current) => ({
        ...current,
        error: requestError instanceof Error ? requestError.message : "Could not delete this image"
      }));
    }
  }

  const terms = detail.data?.terms ?? [];
  const dictionaryWords = detail.data?.words ?? [];
  const images = detail.data?.images ?? [];
  const kanjiCount = terms.filter((term) => term.termType === "kanji").length;
  const wordCount = terms.filter((term) => term.termType === "word").length + dictionaryWords.length;
  const selectedResource = detail.data?.resource ?? resources.find((resource) => resource.id === selectedResourceId);
  const trackedWordIds = new Set(dictionaryWords.map((word) => word.id));
  const trackedCount = images.length + terms.length + dictionaryWords.length + grammar.length;

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
            <span>All items</span>
          </article>
          <article>
            <strong>{kanjiCount}</strong>
            <span>Kanji</span>
          </article>
          <article>
            <strong>{wordCount}</strong>
            <span>Words</span>
          </article>
          <article>
            <strong>{grammar.length}</strong>
            <span>Grammar</span>
          </article>
          <article>
            <strong>{images.length}</strong>
            <span>Images</span>
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
          <h2>{selectedResource?.name ?? "Resource Items"}</h2>
          <span>{detail.loading ? "loading" : `${trackedCount} tracked`}</span>
        </div>
        {detail.error && <p className="error-text">{detail.error}</p>}
        {!selectedResourceId ? (
          <EmptyState title="Pick a resource" detail="Vocabulary, kanji, and grammar examples are grouped by source." />
        ) : trackedCount === 0 ? (
          <EmptyState title="Nothing tracked yet" detail="Use Capture, look up a dictionary word, or add a term manually." />
        ) : (
          <div className="tracked-resource-content">
            {selectedResourceId && images.length > 0 && (
              <ResourceImageBrowser resourceId={selectedResourceId} images={images} onDelete={deleteImage} />
            )}
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
            {grammar.length > 0 && (
              <section>
                <div className="section-subheading">
                  <h3>Grammar examples</h3>
                  <span>{grammar.length}</span>
                </div>
                <div className="resource-grammar-list">
                  {grammar.map((item) => (
                    <article className="resource-grammar-row" key={item.id}>
                      <div className="resource-grammar-heading">
                        <strong>{item.title}</strong>
                        <span>{item.jlptLevel}</span>
                      </div>
                      <div><mark>{item.matchedText}</mark><span>{item.pattern}</span></div>
                      <p lang="ja">{item.sentence}</p>
                      <small>{item.explanation}</small>
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

function resourceIdFromLocation() {
  const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
  const value = new URLSearchParams(hashQuery || window.location.search).get("resource");
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
