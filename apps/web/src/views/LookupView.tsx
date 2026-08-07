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

import { EmptyState, kanjiJlptLabel, emptyDashboard, type Loadable, type View } from "./shared";

export function LookupView() {
  const [query, setQuery] = useState("");
  const [kanji, setKanji] = useState<Kanji[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [knowledgeMessage, setKnowledgeMessage] = useState<string | null>(null);
  const [knowledgeBusy, setKnowledgeBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setKanji([]);
      setWords([]);
      setKnowledgeMessage(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      void runSearch(query);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [query]);

  async function runSearch(value: string) {
    setError(null);
    try {
      const [kanjiResult, wordResult] = await Promise.all([api.kanji(value), api.words(value)]);
      setKanji(kanjiResult.items);
      setWords(wordResult.items);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Search failed");
    }
  }

  async function trackKnowledge(
    itemType: KnowledgeItem["itemType"],
    itemKey: string,
    action: "seen" | "known"
  ) {
    const busyKey = `${itemType}:${itemKey}:${action}`;
    setKnowledgeBusy(busyKey);
    setKnowledgeMessage(null);
    setError(null);

    try {
      if (action === "seen") {
        await api.markKnowledgeSeen({ itemType, itemKey, xpDelta: 1, source: "lookup" });
        setKnowledgeMessage(`${itemKey} gained 1 XP.`);
      } else {
        await api.markKnowledgeKnown({ itemType, itemKey, isKnown: true, source: "lookup" });
        setKnowledgeMessage(`${itemKey} marked as known.`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update knowledge");
    } finally {
      setKnowledgeBusy(null);
    }
  }

  return (
    <section className="view-grid">
      <div className="searchbar">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Japanese, reading, or English gloss"
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={16} />
          </button>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      {knowledgeMessage && <p className="success-text">{knowledgeMessage}</p>}
      <div className="dual-panels">
        <section className="panel">
          <div className="panel-heading">
            <h2>Kanji</h2>
            <span>{kanji.length}</span>
          </div>
          <div className="kanji-grid">
            {kanji.map((item) => (
              <article className="kanji-card" key={item.id}>
                <strong>{item.literal}</strong>
                <span>{item.meanings.slice(0, 3).join(", ") || "No meaning"}</span>
                <small>
                  {kanjiJlptLabel(item.jlptLevel)} · {item.strokeCount ?? "-"} strokes
                </small>
                <div className="knowledge-actions">
                  <button
                    className="mini-button"
                    type="button"
                    disabled={knowledgeBusy === `kanji:${item.literal}:known`}
                    onClick={() => void trackKnowledge("kanji", item.literal, "known")}
                  >
                    <CheckCircle2 size={14} />
                    Known
                  </button>
                </div>
                <small>Kanji XP comes from correct quiz answers.</small>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Words</h2>
            <span>{words.length}</span>
          </div>
          <div className="word-list">
            {words.map((word) => {
              const itemKey = wordKnowledgeKey(word);
              return (
                <article className="word-card" key={word.id}>
                  <div>
                    <strong>{itemKey}</strong>
                    <span>{word.readings.join(" · ")}</span>
                  </div>
                  <p>{word.glosses.slice(0, 3).join("; ")}</p>
                  <div className="knowledge-actions">
                    <button
                      className="mini-button"
                      type="button"
                      disabled={knowledgeBusy === `word:${itemKey}:seen`}
                      onClick={() => void trackKnowledge("word", itemKey, "seen")}
                    >
                      <Plus size={14} />
                      XP
                    </button>
                    <button
                      className="mini-button"
                      type="button"
                      disabled={knowledgeBusy === `word:${itemKey}:known`}
                      onClick={() => void trackKnowledge("word", itemKey, "known")}
                    >
                      <CheckCircle2 size={14} />
                      Known
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}

function wordKnowledgeKey(word: Word) {
  return word.kanjiForms[0] ?? word.readings[0] ?? String(word.entryId);
}
