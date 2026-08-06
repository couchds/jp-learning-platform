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

export function RuntimeView() {
  const [doctor, setDoctor] = useState<Loadable<RuntimeDoctor>>({
    data: null,
    loading: true,
    error: null
  });
  const [ocrLaunching, setOcrLaunching] = useState(false);
  const [ocrLaunchMessage, setOcrLaunchMessage] = useState<string | null>(null);
  const [ocrLaunchError, setOcrLaunchError] = useState<string | null>(null);

  useEffect(() => {
    void loadDoctor();
  }, []);

  async function loadDoctor() {
    setDoctor((current) => ({ ...current, loading: true, error: null }));
    try {
      setDoctor({ data: await api.runtimeDoctor(), loading: false, error: null });
    } catch (requestError) {
      setDoctor({
        data: null,
        loading: false,
        error: requestError instanceof Error ? requestError.message : "Could not run runtime doctor"
      });
    }
  }

  async function launchOcrService() {
    setOcrLaunching(true);
    setOcrLaunchMessage(null);
    setOcrLaunchError(null);
    try {
      const response = await api.launchOcrService();
      setOcrLaunchMessage(
        response.alreadyRunning
          ? "OCR service is already running."
          : response.launched
            ? `OCR service launched${response.pid ? ` as process ${response.pid}` : ""}.`
            : "OCR service launch was already requested."
      );
      await loadDoctor();
    } catch (requestError) {
      setOcrLaunchError(requestError instanceof Error ? requestError.message : "Could not start OCR service");
    } finally {
      setOcrLaunching(false);
    }
  }

  const summary = doctor.data?.summary ?? "warn";
  const summaryCopy = {
    ok: {
      title: "Runtime ready",
      detail: "The API, overlay runtime, storage paths, and companion services are ready."
    },
    warn: {
      title: "Runtime needs attention",
      detail: "One or more optional services or platform permissions may need setup."
    },
    error: {
      title: "Runtime blocked",
      detail: "A required path, script, or Python dependency is missing."
    }
  }[summary];

  return (
    <section className="runtime-view">
      <div className={`runtime-summary ${summary}`}>
        <div>
          <span className="eyebrow">Runtime doctor</span>
          <h2>{doctor.loading ? "Checking this machine" : summaryCopy.title}</h2>
          <p>{doctor.error ?? summaryCopy.detail}</p>
        </div>
        <button className="primary-button" type="button" onClick={() => void loadDoctor()}>
          <Activity size={17} />
          Run checks
        </button>
      </div>

      <div className="doctor-grid">
        {(doctor.data?.checks ?? []).map((check) => {
          const StatusIcon =
            check.status === "ok" ? CheckCircle2 : check.status === "error" ? X : Activity;
          return (
            <article className="doctor-card" key={check.id}>
              <div className="doctor-card-heading">
                <StatusIcon size={18} aria-hidden="true" />
                <span className={`status-pill ${check.status}`}>{check.status}</span>
              </div>
              <h3>{check.label}</h3>
              <p>{check.detail}</p>
              {check.action && <small>{check.action}</small>}
              {check.id === "ocr-service" && (
                <button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={ocrLaunching}
                  onClick={() => void launchOcrService()}
                >
                  <Play size={16} />
                  {ocrLaunching ? "Starting..." : "Start OCR service"}
                </button>
              )}
            </article>
          );
        })}
      </div>

      {ocrLaunchMessage && <p className="success-text">{ocrLaunchMessage}</p>}
      {ocrLaunchError && <p className="error-text">{ocrLaunchError}</p>}

      {!doctor.loading && !doctor.error && doctor.data?.checks.length === 0 && (
        <EmptyState title="No checks returned" detail="The API responded, but no runtime checks were reported." />
      )}
    </section>
  );
}
