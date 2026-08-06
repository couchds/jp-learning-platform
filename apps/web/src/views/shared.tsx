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

export type View =
  | "home"
  | "dashboard"
  | "database"
  | "profile"
  | "capture"
  | "runtime"
  | "resources"
  | "tracker"
  | "quiz"
  | "lookup"
  | "draw"
  | "speech"
  | "review";

export type Loadable<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

type NavItem = { id: View; label: string; icon: typeof Gauge };

export const emptyDashboard: Dashboard = {
  counts: {
    resources: 0,
    kanji: 0,
    words: 0,
    images: 0,
    pronunciationRecordings: 0,
    dueReviews: 0
  },
  recentResources: []
};

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Overview",
    items: [
      { id: "home", label: "Home", icon: Home },
      { id: "dashboard", label: "Dashboard", icon: Gauge },
      { id: "profile", label: "Profile", icon: Brain }
    ]
  },
  {
    label: "Library",
    items: [
      { id: "database", label: "Database", icon: Database },
      { id: "resources", label: "Resources", icon: Boxes },
      { id: "lookup", label: "Lookup", icon: Search }
    ]
  },
  {
    label: "Practice",
    items: [
      { id: "capture", label: "Capture", icon: Crosshair },
      { id: "tracker", label: "Tracker", icon: ClipboardList },
      { id: "quiz", label: "Quiz", icon: Trophy }
    ]
  },
  {
    label: "Tools",
    items: [
      { id: "runtime", label: "Runtime", icon: Wrench },
      { id: "draw", label: "Draw", icon: Pencil },
      { id: "speech", label: "Speech", icon: Mic }
    ]
  }
];

const navItems = navGroups.flatMap((group) => group.items);

const viewRoutes: Record<View, string> = {
  home: "/",
  dashboard: "/dashboard",
  database: "/database",
  profile: "/profile",
  capture: "/capture",
  runtime: "/runtime",
  resources: "/resources",
  tracker: "/tracker",
  quiz: "/quiz",
  lookup: "/lookup",
  draw: "/draw",
  speech: "/speech",
  review: "/review"
};

const routeViews = new Map(Object.entries(viewRoutes).map(([view, path]) => [path, view as View]));

function viewFromPath(pathname: string): View {
  return routeViews.get(pathname) ?? "home";
}

function navigateToView(view: View) {
  window.location.assign(viewRoutes[view]);
}

const viewSummaries: Record<View, string> = {
  home: "Capture, collect, and review from your study workspace.",
  dashboard: "A quick read on resources, captures, and reviews.",
  database: "Browse imported kanji, words, sentences, and relation data.",
  profile: "Track knowledge growth, XP, and kanji relationships.",
  capture: "Run OCR tools and attach captures to study resources.",
  runtime: "Check service readiness, platform permissions, and companion tools.",
  resources: "Create and organize the media you are studying from.",
  tracker: "Add dictionary-backed words or custom terms to a resource.",
  quiz: "Practice resource vocabulary with quick recall sessions.",
  lookup: "Search kanji and word data, then mark what you know.",
  draw: "Draw kanji and inspect recognition candidates.",
  speech: "Inspect pronunciation tooling and training commands.",
  review: "Work through vocabulary and kanji that are due now."
};


export type DatabaseTab = "words" | "kanji" | "sentences" | "graph";
export type KanjiLevelFilter = 5 | 4 | 3 | 2 | 1;
export const defaultDatabaseQueries: Record<DatabaseTab, string> = { words: "", kanji: "", sentences: "", graph: "" };
export const kanjiLevelFilters: Array<{ label: string; value: KanjiLevelFilter | null }> = [
  { label: "All", value: null }, { label: "N5", value: 5 }, { label: "N4", value: 4 }, { label: "N3", value: 3 }, { label: "N2", value: 2 }, { label: "N1", value: 1 }
];
export function kanjiJlptLabel(level: number | null) {
  if (level == null) return "JLPT -";
  return ({ 4: "JLPT N5", 3: "JLPT N4", 2: "JLPT N3/N2", 1: "JLPT N1", 5: "JLPT N5" } as Record<number, string>)[level] ?? `JLPT ${level}`;
}
export type ImportAction = { jobType: ImportJob["jobType"]; title: string; detail: string; payload?: Omit<Parameters<typeof api.createImportJob>[0], "jobType"> };
export const importActions: ImportAction[] = [
  { jobType: "starter_data", title: "Import starter data", detail: "Adds a small useful set of kanji, words, sentences, and graph links." },
  { jobType: "kanjidic2", title: "Import KANJIDIC2", detail: "Downloads the kanji dataset if needed, saves it on disk, then imports it." },
  { jobType: "jmdict", title: "Import JMdict", detail: "Downloads the English dictionary if needed, saves it on disk, then imports it." },
  { jobType: "sentence_examples", title: "Import sentences", detail: "Imports the saved sentence TSV from the app's import folder.", payload: { source: "saved-tsv" } },
  { jobType: "kanji_graph", title: "Build kanji graph", detail: "Creates relation edges from imported kanji metadata.", payload: { limit: 3000, maxEdges: 24, maxGroupSize: 240 } }
];
export function wordKnowledgeKey(word: Word) { return word.kanjiForms[0] ?? word.readings[0] ?? String(word.entryId); }
export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><Sparkles size={22} /><strong>{title}</strong><span>{detail}</span></div>;
}
