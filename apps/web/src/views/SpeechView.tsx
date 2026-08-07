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

import { emptyDashboard, type Loadable, type View } from "./shared";

export function SpeechView() {
  const [info, setInfo] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "info" | "export" | "train") {
    setError(null);
    setMessage(null);
    try {
      const result =
        action === "info"
          ? await api.speechInfo()
          : action === "export"
            ? await api.exportSpeechData()
            : await api.trainSpeechModel();
      setInfo(result);
      setMessage(action === "train" ? "Training request sent" : "Request completed");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Speech request failed");
    }
  }

  const pretty = useMemo(() => JSON.stringify(info, null, 2), [info]);

  return (
    <section className="split-view">
      <div className="panel form-panel">
        <div className="panel-heading">
          <h2>Speech Model</h2>
        </div>
        <button className="secondary-button" type="button" onClick={() => void run("info")}>
          <Activity size={17} />
          Model info
        </button>
        <button className="secondary-button" type="button" onClick={() => void run("export")}>
          <Upload size={17} />
          Export data
        </button>
        <button className="primary-button" type="button" onClick={() => void run("train")}>
          <Brain size={17} />
          Train lightweight
        </button>
        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>Status Payload</h2>
        </div>
        <pre className="json-box">{pretty || "{}"}</pre>
      </section>
    </section>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <Sparkles size={22} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}
