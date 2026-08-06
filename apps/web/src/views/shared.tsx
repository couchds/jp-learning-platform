import { Sparkles } from "lucide-react";
import { api } from "../api";
import type { Dashboard, ImportJob, Word } from "../types";

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
  | "settings"
  | "review";

export type Loadable<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

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
