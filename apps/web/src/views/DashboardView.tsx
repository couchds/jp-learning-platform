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

export function DashboardView({
  state,
  onRefresh
}: {
  state: Loadable<Dashboard>;
  onRefresh: () => void;
}) {
  const data = state.data ?? emptyDashboard;
  const stats = [
    ["Resources", data.counts.resources, Boxes, null],
    ["Kanji", data.counts.kanji, BookOpen, null],
    ["Words", data.counts.words, Sparkles, null],
    ["OCR Images", data.counts.images, FileImage, null],
    ["Recordings", data.counts.pronunciationRecordings, Mic, null],
    ["Due Reviews", data.counts.dueReviews, Brain, "/review"]
  ] as const;

  return (
    <section className="view-grid">
      <div className="status-band">
        <div>
          <span className="eyebrow">Study state</span>
          <h2>{state.loading ? "Loading workspace" : "Ready"}</h2>
          {state.error && <p className="error-text">{state.error}</p>}
        </div>
        <button className="primary-button" type="button" onClick={onRefresh}>
          <Activity size={17} />
          Refresh
        </button>
      </div>

      <div className="metrics-grid">
        {stats.map(([label, value, Icon, href]) => {
          const content = <>
            <Icon size={18} />
            <strong>{value.toLocaleString()}</strong>
            <span>{label}</span>
          </>;
          return href ? <a className="metric-card" href={href} key={label}>{content}</a> : <article className="metric-card" key={label}>{content}</article>;
        })}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>Recent Resources</h2>
        </div>
        {data.recentResources.length === 0 ? (
          <EmptyState title="No resources yet" detail="Add your first manga, game, article, or book." />
        ) : (
          <div className="table-list">
            {data.recentResources.map((resource) => (
              <div className="table-row" key={resource.id}>
                <strong>{resource.name}</strong>
                <span>{resource.type}</span>
                <span>{resource.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

type DatabaseTab = "words" | "kanji" | "sentences" | "graph";
type KanjiLevelFilter = 5 | 4 | 3 | 2 | 1;

const defaultDatabaseQueries: Record<DatabaseTab, string> = {
  words: "",
  kanji: "",
  sentences: "",
  graph: ""
};

const kanjiLevelFilters: Array<{ label: string; value: KanjiLevelFilter | null }> = [
  { label: "All", value: null },
  { label: "N5", value: 5 },
  { label: "N4", value: 4 },
  { label: "N3", value: 3 },
  { label: "N2", value: 2 },
  { label: "N1", value: 1 }
];

function kanjiJlptLabel(level: number | null) {
  if (level == null) {
    return "JLPT -";
  }

  const labels: Record<number, string> = {
    4: "JLPT N5",
    3: "JLPT N4",
    2: "JLPT N3/N2",
    1: "JLPT N1",
    5: "JLPT N5"
  };

  return labels[level] ?? `JLPT ${level}`;
}

type ImportAction = {
  jobType: ImportJob["jobType"];
  title: string;
  detail: string;
  payload?: Omit<Parameters<typeof api.createImportJob>[0], "jobType">;
};

const importActions: ImportAction[] = [
  {
    jobType: "starter_data",
    title: "Import starter data",
    detail: "Adds a small useful set of kanji, words, sentences, and graph links."
  },
  {
    jobType: "kanjidic2",
    title: "Import KANJIDIC2",
    detail: "Downloads the kanji dataset if needed, saves it on disk, then imports it."
  },
  {
    jobType: "jmdict",
    title: "Import JMdict",
    detail: "Downloads the English dictionary if needed, saves it on disk, then imports it."
  },
  {
    jobType: "sentence_examples",
    title: "Import sentences",
    detail: "Imports the saved sentence TSV from the app's import folder.",
    payload: { source: "saved-tsv" }
  },
  {
    jobType: "kanji_graph",
    title: "Build kanji graph",
    detail: "Creates relation edges from imported kanji metadata.",
    payload: { limit: 3000, maxEdges: 24, maxGroupSize: 240 }
  }
];
