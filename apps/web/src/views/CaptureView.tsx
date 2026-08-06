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

export function CaptureView({
  onChange,
  onNavigate
}: {
  onChange: () => void;
  onNavigate: (view: View) => void;
}) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<Loadable<DesktopOverlayStatus>>({
    data: null,
    loading: true,
    error: null
  });
  const [ocrService, setOcrService] = useState<Loadable<ServiceHealth>>({
    data: null,
    loading: true,
    error: null
  });
  const [result, setResult] = useState<OcrResult | null>(null);
  const [trackedTerms, setTrackedTerms] = useState<ResourceTerm[]>([]);
  const [busy, setBusy] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [startingOcr, setStartingOcr] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadResources();
    void loadOverlayStatus();
    void loadOcrServiceStatus();
  }, []);

  async function loadResources() {
    try {
      const response = await api.resources("?limit=1");
      setResources(response.items);
      setSelectedResourceId((current) => current ?? response.items[0]?.id ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load resources");
    }
  }

  async function loadOverlayStatus() {
    setOverlay((current) => ({ ...current, loading: true, error: null }));
    try {
      setOverlay({ data: await api.desktopOverlayStatus(), loading: false, error: null });
    } catch (requestError) {
      setOverlay({
        data: null,
        loading: false,
        error: requestError instanceof Error ? requestError.message : "Could not inspect overlay"
      });
    }
  }

  async function loadOcrServiceStatus() {
    setOcrService((current) => ({ ...current, loading: true, error: null }));
    try {
      setOcrService({ data: await api.ocrHealth(), loading: false, error: null });
    } catch (requestError) {
      setOcrService({
        data: null,
        loading: false,
        error: requestError instanceof Error ? requestError.message : "Could not inspect OCR service"
      });
    }
  }

  async function launchOcrService() {
    setStartingOcr(true);
    setMessage(null);
    setError(null);
    try {
      const response = await api.launchOcrService();
      setMessage(
        response.alreadyRunning
          ? "OCR service is already running."
          : response.launched
            ? `OCR service launched${response.pid ? ` as process ${response.pid}` : ""}.`
            : "OCR service launch was already requested."
      );
      await loadOcrServiceStatus();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start OCR service");
    } finally {
      setStartingOcr(false);
    }
  }

  async function launchOverlay() {
    setLaunching(true);
    setMessage(null);
    setError(null);
    try {
      const response = await api.launchDesktopOverlay();
      setMessage(
        response.launched
          ? `Overlay launched${response.pid ? ` as process ${response.pid}` : ""}.`
          : "Overlay launch requested."
      );
      await loadOverlayStatus();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not launch overlay");
    } finally {
      setLaunching(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) {
      return;
    }

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      if (selectedResourceId) {
        const response = await api.ocrResourceImage(selectedResourceId, file, true);
        setResult(response.ocr);
        setTrackedTerms(response.trackedTerms);
        setMessage(
          response.trackedTerms.length > 0
            ? `Tracked ${response.trackedTerms.length} terms for this resource.`
            : "OCR completed; no new terms were suggested."
        );
        onChange();
      } else {
        setResult(await api.ocrImage(file));
        setTrackedTerms([]);
        setMessage("OCR completed without resource tracking.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "OCR failed");
    } finally {
      setBusy(false);
    }
  }

  const selectedResource = resources.find((resource) => resource.id === selectedResourceId);
  const suggestedTerms = result?.terms ?? [];
  const ocrHealth =
    ocrService.data?.health && typeof ocrService.data.health === "object"
      ? (ocrService.data.health as {
          status?: string;
          active_backend?: string;
          reason?: string | null;
        })
      : null;
  const ocrWarming = ocrHealth?.status === "warming";
  const ocrReady = Boolean(ocrService.data && ocrService.data.available !== false && !ocrService.error);
  const ocrStatusLabel = ocrService.loading ? "checking" : ocrReady ? "ready" : ocrWarming ? "warming" : "offline";
  const ocrCardState = ocrReady ? "ready" : ocrWarming ? "warming" : "offline";
  const ocrTitle = ocrReady
    ? "Japanese OCR is ready."
    : ocrWarming
      ? "OCR model is warming up."
      : "Start OCR before capturing text.";
  const ocrDetail = ocrWarming
    ? `Loading ${ocrHealth?.active_backend ?? "OCR"}. Refresh in a moment before capturing text.`
    : "The overlay and screenshot uploader are ready to process captured text.";
  const overlayRuntime = overlay.data?.launchTarget === "app-bundle"
    ? "Yomunami app"
    : overlay.data?.pythonDetail ?? overlay.data?.python ?? "python";
  const overlayPermissionTarget = overlay.data?.launchTarget === "app-bundle"
    ? "Yomunami OCR Overlay.app"
    : "the terminal or Python executable that starts the overlay";
  const needsMacPermissions = overlay.data?.platform === "darwin";

  return (
    <section className="capture-layout">
      <div className="panel overlay-panel">
        <div className="panel-heading">
          <h2>Desktop Overlay</h2>
          <span>
            {overlay.loading
              ? "checking"
              : `${overlay.data?.available ? "installed" : "missing"}${
                  overlayRuntime ? ` · ${overlayRuntime}` : ""
                }`}
          </span>
        </div>
        <div className="overlay-status">
          <Monitor size={32} />
          <div>
            <strong>Capture Japanese text from any visible window.</strong>
            <p>
              Launch the overlay, select a resource, then press the hotkey over a game, emulator,
              browser, or document. Use tighter region selection when the screen is dense.
            </p>
          </div>
        </div>
        {overlay.error && <p className="error-text">{overlay.error}</p>}
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            disabled={launching || overlay.data?.available === false}
            onClick={() => void launchOverlay()}
          >
            <Play size={17} />
            {launching ? "Launching..." : "Launch overlay"}
          </button>
          <button className="secondary-button" type="button" onClick={() => void loadOverlayStatus()}>
            <Activity size={17} />
            Refresh status
          </button>
          <button className="secondary-button" type="button" onClick={() => onNavigate("runtime")}>
            <Wrench size={17} />
            Runtime doctor
          </button>
        </div>
        <div className="hotkey-card">
          <Keyboard size={18} />
          <span>Default hotkey</span>
          <strong>ctrl+shift+o</strong>
        </div>
        {needsMacPermissions && (
          <p className="helper-text">
            On macOS, grant Screen Recording and Accessibility permissions to {overlayPermissionTarget}.
          </p>
        )}
      </div>

      <div className="panel ocr-service-panel">
        <div className="panel-heading">
          <h2>OCR Engine</h2>
          <span>{ocrStatusLabel}</span>
        </div>
        <div className={`service-launch-card ${ocrCardState}`}>
          {ocrReady ? <CheckCircle2 size={28} /> : <Activity size={28} />}
          <div>
            <strong>{ocrTitle}</strong>
            <p>{ocrDetail}</p>
          </div>
        </div>
        {ocrWarming && ocrHealth?.reason && <p className="helper-text">{ocrHealth.reason}</p>}
        {ocrService.error && <p className="error-text">{ocrService.error}</p>}
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            disabled={startingOcr || ocrReady || ocrWarming}
            onClick={() => void launchOcrService()}
          >
            <Play size={17} />
            {startingOcr ? "Starting..." : "Start OCR service"}
          </button>
          <button className="secondary-button" type="button" onClick={() => void loadOcrServiceStatus()}>
            <Activity size={17} />
            Refresh OCR
          </button>
        </div>
      </div>

      <div className="panel upload-panel">
        <FileImage size={28} />
        <h2>Screenshot OCR</h2>
        <p>Upload a screenshot or cropped text image. If a resource is selected, suggested terms are tracked automatically.</p>
        <label>
          Track to resource
          <ResourcePicker value={selectedResourceId} allowNone onChange={(id, resource) => {
            setSelectedResourceId(id);
            if (resource) setResources((current) => [...new Map([...current, resource].map((item) => [item.id, item])).values()]);
          }} />
        </label>
        <label className="file-button">
          <Upload size={18} />
          {busy ? "Processing..." : "Choose image"}
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(event) => void upload(event.target.files?.[0])}
          />
        </label>
        {selectedResource && (
          <p className="helper-text">Captures will be attached to {selectedResource.name}.</p>
        )}
        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </div>

      <section className="panel capture-results">
        <div className="panel-heading">
          <h2>Latest OCR Result</h2>
          <span>{result?.elements.length ?? 0} elements</span>
        </div>
        {!result ? (
          <EmptyState title="No capture yet" detail="Launch the overlay or upload a screenshot to see recognized text and term suggestions." />
        ) : (
          <>
            <pre className="ocr-text">{result.rawText}</pre>
            <div className="element-list">
              {result.elements.map((element, index) => (
                <span key={`${element.text}-${index}`} className={`element-chip ${element.element_type}`}>
                  {element.text}
                </span>
              ))}
            </div>
            <div className="term-suggestion-grid">
              {(trackedTerms.length > 0 ? trackedTerms : suggestedTerms).map((term, index) => (
                <article className="term-card" key={`${term.text}-${index}`}>
                  <span>{term.termType}</span>
                  <strong>{term.text}</strong>
                  <small>{term.reading || term.meaning || "Captured from OCR"}</small>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
