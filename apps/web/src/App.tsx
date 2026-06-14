import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  Boxes,
  Brain,
  CheckCircle2,
  Circle,
  ClipboardList,
  Crosshair,
  Database,
  FileImage,
  Gauge,
  Home,
  Keyboard,
  Layers,
  Mic,
  Monitor,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Upload,
  X
} from "lucide-react";
import { api } from "./api";
import type {
  Dashboard,
  DesktopOverlayStatus,
  Kanji,
  OcrResult,
  QuizAnswerPayload,
  QuizQuestion,
  QuizSession,
  RecognitionResult,
  Resource,
  ResourceDetail,
  ResourceTerm,
  ServiceHealth,
  Word
} from "./types";

type View = "home" | "dashboard" | "capture" | "resources" | "tracker" | "quiz" | "lookup" | "draw" | "speech";

type Loadable<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

const emptyDashboard: Dashboard = {
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

const navItems: Array<{ id: View; label: string; icon: typeof Gauge }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "capture", label: "Capture", icon: Crosshair },
  { id: "resources", label: "Resources", icon: Boxes },
  { id: "tracker", label: "Tracker", icon: ClipboardList },
  { id: "quiz", label: "Quiz", icon: Trophy },
  { id: "lookup", label: "Lookup", icon: Search },
  { id: "draw", label: "Draw", icon: Pencil },
  { id: "speech", label: "Speech", icon: Mic }
];

export function App() {
  const [view, setView] = useState<View>("home");
  const [dashboard, setDashboard] = useState<Loadable<Dashboard>>({
    data: null,
    loading: true,
    error: null
  });
  const [services, setServices] = useState<ServiceHealth[]>([]);

  useEffect(() => {
    void refreshDashboard();
    void refreshServices();
  }, []);

  async function refreshDashboard() {
    setDashboard((current) => ({ ...current, loading: true, error: null }));
    try {
      setDashboard({ data: await api.dashboard(), loading: false, error: null });
    } catch (error) {
      setDashboard({
        data: emptyDashboard,
        loading: false,
        error: error instanceof Error ? error.message : "Could not load dashboard"
      });
    }
  }

  async function refreshServices() {
    setServices(await api.serviceHealth());
  }

  const activeTitle = navItems.find((item) => item.id === view)?.label ?? "Dashboard";

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">日</div>
          <div>
            <strong>Yomunami</strong>
            <span>local study desk</span>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "nav-button active" : "nav-button"}
                type="button"
                onClick={() => setView(item.id)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <section className="service-strip" aria-label="Local companion services">
          <div className="section-kicker">
            <Activity size={14} />
            Services
          </div>
          {services.map((service) => (
            <ServiceRow key={service.service} service={service} />
          ))}
          <button className="quiet-button" type="button" onClick={() => void refreshServices()}>
            <Settings2 size={15} />
            Refresh
          </button>
        </section>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Local-first Japanese learning</span>
            <h1>{activeTitle}</h1>
          </div>
          <div className="api-pill">
            <Database size={16} />
            {api.apiUrl.replace("http://", "")}
          </div>
        </header>

        {view === "home" && (
          <HomeView
            state={dashboard}
            services={services}
            onNavigate={setView}
          />
        )}
        {view === "dashboard" && (
          <DashboardView state={dashboard} onRefresh={() => void refreshDashboard()} />
        )}
        {view === "capture" && <CaptureView onChange={() => void refreshDashboard()} />}
        {view === "resources" && <ResourcesView onChange={() => void refreshDashboard()} />}
        {view === "tracker" && <TrackerView onChange={() => void refreshDashboard()} />}
        {view === "quiz" && <QuizView />}
        {view === "lookup" && <LookupView />}
        {view === "draw" && <DrawView />}
        {view === "speech" && <SpeechView />}
      </main>
    </div>
  );
}

function ServiceRow({ service }: { service: ServiceHealth }) {
  const available = service.available !== false && !service.error;
  return (
    <div className="service-row">
      <Circle size={10} className={available ? "ok-dot" : "bad-dot"} fill="currentColor" />
      <span>{service.service}</span>
      <small>{available ? "ready" : "offline"}</small>
    </div>
  );
}

function HomeView({
  state,
  services,
  onNavigate
}: {
  state: Loadable<Dashboard>;
  services: ServiceHealth[];
  onNavigate: (view: View) => void;
}) {
  const data = state.data ?? emptyDashboard;
  const readyServices = services.filter((service) => service.available !== false && !service.error).length;
  const features = [
    {
      icon: Monitor,
      title: "Any-window OCR overlay",
      detail:
        "Launch a local hotkey overlay from the browser, drag over game or browser text, then save words and kanji to a resource."
    },
    {
      icon: ClipboardList,
      title: "Resource tracker",
      detail:
        "Organize manga, games, sites, books, and shows with captured vocabulary, kanji, notes, and OCR history on this machine."
    },
    {
      icon: Trophy,
      title: "Resource quizzes",
      detail:
        "Turn tracked terms into quick recall sessions and persist quiz attempts locally for each resource."
    },
    {
      icon: Pencil,
      title: "Handwriting recognition",
      detail:
        "Draw unknown kanji and query the local recognition service for ranked candidates."
    },
    {
      icon: Mic,
      title: "Pronunciation model",
      detail:
        "Keep speech recordings and lightweight model training local while the app grows toward richer feedback."
    },
    {
      icon: Shield,
      title: "Private by default",
      detail:
        "SQLite, uploads, OCR captures, and model artifacts stay in ignored local paths with no public deployment assumptions."
    }
  ] as const;

  return (
    <section className="home-view">
      <div className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow">Read Japanese where you actually meet it</span>
          <h2>Capture text from games, track what matters, and drill it by resource.</h2>
          <p>
            Yomunami is a local-first Japanese study cockpit for immersion workflows: OCR any window,
            collect vocabulary from real media, look up kanji and words, practice handwriting, and run
            lightweight quizzes without sending your study data to a hosted app.
          </p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={() => onNavigate("capture")}>
              <Crosshair size={17} />
              Open capture controls
            </button>
            <button className="secondary-button" type="button" onClick={() => onNavigate("resources")}>
              <Boxes size={17} />
              Add a resource
            </button>
          </div>
        </div>
        <div className="hero-console" aria-label="Local workspace summary">
          <div>
            <span>Resources</span>
            <strong>{data.counts.resources.toLocaleString()}</strong>
          </div>
          <div>
            <span>Tracked words</span>
            <strong>{data.counts.words.toLocaleString()}</strong>
          </div>
          <div>
            <span>OCR images</span>
            <strong>{data.counts.images.toLocaleString()}</strong>
          </div>
          <div>
            <span>Services ready</span>
            <strong>
              {readyServices}/{services.length || 3}
            </strong>
          </div>
        </div>
      </div>

      <div className="feature-grid">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <article className="feature-card" key={feature.title}>
              <Icon size={22} />
              <h3>{feature.title}</h3>
              <p>{feature.detail}</p>
            </article>
          );
        })}
      </div>

      <section className="workflow-strip">
        <div>
          <Keyboard size={20} />
          <span>Hotkey capture</span>
          <strong>ctrl+shift+o</strong>
        </div>
        <div>
          <Layers size={20} />
          <span>Track by source</span>
          <strong>game, manga, site, book</strong>
        </div>
        <div>
          <Target size={20} />
          <span>Practice loop</span>
          <strong>capture, save, quiz</strong>
        </div>
      </section>
    </section>
  );
}

function DashboardView({
  state,
  onRefresh
}: {
  state: Loadable<Dashboard>;
  onRefresh: () => void;
}) {
  const data = state.data ?? emptyDashboard;
  const stats = [
    ["Resources", data.counts.resources, Boxes],
    ["Kanji", data.counts.kanji, BookOpen],
    ["Words", data.counts.words, Sparkles],
    ["OCR Images", data.counts.images, FileImage],
    ["Recordings", data.counts.pronunciationRecordings, Mic],
    ["Due Reviews", data.counts.dueReviews, Brain]
  ] as const;

  return (
    <section className="view-grid">
      <div className="status-band">
        <div>
          <span className="eyebrow">Study state</span>
          <h2>{state.loading ? "Loading local workspace" : "Ready on this machine"}</h2>
          {state.error && <p className="error-text">{state.error}</p>}
        </div>
        <button className="primary-button" type="button" onClick={onRefresh}>
          <Activity size={17} />
          Refresh
        </button>
      </div>

      <div className="metrics-grid">
        {stats.map(([label, value, Icon]) => (
          <article className="metric-card" key={label}>
            <Icon size={18} />
            <strong>{value.toLocaleString()}</strong>
            <span>{label}</span>
          </article>
        ))}
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

function CaptureView({ onChange }: { onChange: () => void }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<Loadable<DesktopOverlayStatus>>({
    data: null,
    loading: true,
    error: null
  });
  const [result, setResult] = useState<OcrResult | null>(null);
  const [trackedTerms, setTrackedTerms] = useState<ResourceTerm[]>([]);
  const [busy, setBusy] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadResources();
    void loadOverlayStatus();
  }, []);

  async function loadResources() {
    const response = await api.resources("?limit=100");
    setResources(response.items);
    setSelectedResourceId((current) => {
      if (current && response.items.some((resource) => resource.id === current)) {
        return current;
      }

      return response.items[0]?.id ?? null;
    });
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

  return (
    <section className="capture-layout">
      <div className="panel overlay-panel">
        <div className="panel-heading">
          <h2>Desktop Overlay</h2>
          <span>{overlay.loading ? "checking" : overlay.data?.available ? "installed" : "missing"}</span>
        </div>
        <div className="overlay-status">
          <Monitor size={32} />
          <div>
            <strong>Capture Japanese text from any visible window.</strong>
            <p>
              Launch the local overlay, select a resource, press the hotkey, then drag over game,
              emulator, browser, or document text.
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
        </div>
        <div className="hotkey-card">
          <Keyboard size={18} />
          <span>Default hotkey</span>
          <strong>ctrl+shift+o</strong>
        </div>
        <p className="helper-text">
          On macOS, Screen Recording and Accessibility permissions may be required for the terminal or
          Python executable that starts the overlay.
        </p>
      </div>

      <div className="panel upload-panel">
        <FileImage size={28} />
        <h2>Screenshot OCR</h2>
        <p>Upload a screenshot or cropped text image. If a resource is selected, suggested terms are tracked automatically.</p>
        <label>
          Track to resource
          <select
            value={selectedResourceId ?? ""}
            onChange={(event) => setSelectedResourceId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">No resource</option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </select>
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

function ResourcesView({ onChange }: { onChange: () => void }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "manga",
    status: "in_progress",
    difficultyLevel: "intermediate",
    tags: "",
    description: ""
  });

  useEffect(() => {
    void loadResources();
  }, []);

  async function loadResources() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.resources();
      setResources(result.items);
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

    await api.createResource({
      name: form.name.trim(),
      type: form.type,
      status: form.status,
      difficultyLevel: form.difficultyLevel,
      description: form.description.trim() || null,
      tags: form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    });

    setForm((current) => ({ ...current, name: "", tags: "", description: "" }));
    await loadResources();
    onChange();
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
        <button className="primary-button" type="submit">
          <Plus size={17} />
          Add
        </button>
      </form>

      <section className="panel">
        <div className="panel-heading">
          <h2>Library</h2>
          <span>{loading ? "loading" : `${resources.length} shown`}</span>
        </div>
        {error && <p className="error-text">{error}</p>}
        {resources.length === 0 ? (
          <EmptyState title="Your local shelf is empty" detail="Create a resource to start attaching words, kanji, OCR captures, and notes." />
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
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function TrackerView({ onChange }: { onChange: () => void }) {
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
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadResources();
  }, []);

  useEffect(() => {
    if (selectedResourceId) {
      void loadDetail(selectedResourceId);
    }
  }, [selectedResourceId]);

  async function loadResources() {
    const response = await api.resources("?limit=100");
    setResources(response.items);
    setSelectedResourceId((current) => {
      if (current && response.items.some((resource) => resource.id === current)) {
        return current;
      }

      return response.items[0]?.id ?? null;
    });
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

    await api.addResourceTerm(selectedResourceId, {
      termType: form.termType,
      text: form.text.trim(),
      reading: form.reading.trim() || null,
      meaning: form.meaning.trim() || null,
      notes: form.notes.trim() || null,
      source: "manual",
      frequency: 1
    });
    setForm((current) => ({ ...current, text: "", reading: "", meaning: "", notes: "" }));
    setMessage("Term saved to this resource.");
    await loadDetail(selectedResourceId);
    onChange();
  }

  const terms = detail.data?.terms ?? [];
  const kanjiCount = terms.filter((term) => term.termType === "kanji").length;
  const wordCount = terms.filter((term) => term.termType === "word").length;
  const selectedResource = resources.find((resource) => resource.id === selectedResourceId);

  return (
    <section className="tracker-layout">
      <aside className="panel form-panel">
        <div className="panel-heading">
          <h2>Tracker</h2>
          <span>{resources.length} resources</span>
        </div>
        <label>
          Resource
          <select
            value={selectedResourceId ?? ""}
            onChange={(event) => setSelectedResourceId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">Choose a resource</option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </select>
        </label>
        <div className="tracker-metrics">
          <article>
            <strong>{terms.length}</strong>
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
        <form className="inline-form" onSubmit={(event) => void addTerm(event)}>
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
          <button className="primary-button" type="submit" disabled={!selectedResourceId}>
            <Save size={17} />
            Save term
          </button>
          {message && <p className="success-text">{message}</p>}
        </form>
      </aside>

      <section className="panel">
        <div className="panel-heading">
          <h2>{selectedResource?.name ?? "Resource Terms"}</h2>
          <span>{detail.loading ? "loading" : `${terms.length} tracked`}</span>
        </div>
        {detail.error && <p className="error-text">{detail.error}</p>}
        {!selectedResourceId ? (
          <EmptyState title="Pick a resource" detail="Tracked OCR terms and manual vocabulary are grouped by source." />
        ) : terms.length === 0 ? (
          <EmptyState title="No terms yet" detail="Use Capture to OCR a screenshot or add a term manually." />
        ) : (
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
        )}
      </section>
    </section>
  );
}

function QuizView() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [deck, setDeck] = useState<QuizQuestion[]>([]);
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answered, setAnswered] = useState<QuizAnswerPayload[]>([]);
  const [feedback, setFeedback] = useState<QuizAnswerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadResources();
  }, []);

  useEffect(() => {
    if (selectedResourceId) {
      void loadQuiz(selectedResourceId);
    }
  }, [selectedResourceId]);

  async function loadResources() {
    const response = await api.resources("?limit=100");
    setResources(response.items);
    setSelectedResourceId((current) => {
      if (current && response.items.some((resource) => resource.id === current)) {
        return current;
      }

      return response.items[0]?.id ?? null;
    });
    if (response.items.length === 0) {
      setLoading(false);
    }
  }

  async function loadQuiz(resourceId: number) {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const [deckResponse, sessionResponse] = await Promise.all([
        api.quizDeck(resourceId, 20),
        api.quizSessions(resourceId)
      ]);
      setDeck(deckResponse.questions);
      setSessions(sessionResponse.items);
      setIndex(0);
      setAnswer("");
      setAnswered([]);
      setFeedback(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load quiz deck");
    } finally {
      setLoading(false);
    }
  }

  function buildAnswer(): QuizAnswerPayload | null {
    const current = deck[index];
    if (!current) {
      return null;
    }

    return {
      prompt: current.prompt,
      answer: answer.trim() || null,
      expectedAnswer: current.expectedAnswer,
      correct: isAnswerCorrect(answer, current.expectedAnswer),
      sourceType: current.sourceType,
      sourceKey: current.sourceKey
    };
  }

  function checkAnswer() {
    const currentAnswer = buildAnswer();
    if (currentAnswer) {
      setFeedback(currentAnswer);
    }
  }

  async function advance() {
    const currentAnswer = feedback ?? buildAnswer();
    if (!currentAnswer || !selectedResourceId) {
      return;
    }

    const nextAnswers = [...answered, currentAnswer];
    if (index < deck.length - 1) {
      setAnswered(nextAnswers);
      setIndex((current) => current + 1);
      setAnswer("");
      setFeedback(null);
      return;
    }

    await api.saveQuizSession(selectedResourceId, nextAnswers);
    const correct = nextAnswers.filter((item) => item.correct).length;
    await loadQuiz(selectedResourceId);
    setMessage(`Quiz saved: ${correct}/${nextAnswers.length} correct.`);
  }

  const current = deck[index];
  const selectedResource = resources.find((resource) => resource.id === selectedResourceId);
  const scoreSoFar = answered.filter((item) => item.correct).length + (feedback?.correct ? 1 : 0);
  const totalAnswered = answered.length + (feedback ? 1 : 0);

  return (
    <section className="quiz-layout">
      <aside className="panel form-panel">
        <div className="panel-heading">
          <h2>Quiz Setup</h2>
          <span>{deck.length} prompts</span>
        </div>
        <label>
          Resource
          <select
            value={selectedResourceId ?? ""}
            onChange={(event) => setSelectedResourceId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">Choose a resource</option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={!selectedResourceId}
          onClick={() => selectedResourceId && void loadQuiz(selectedResourceId)}
        >
          <RotateCcw size={17} />
          Reset deck
        </button>
        <div className="session-list">
          <strong>Recent sessions</strong>
          {sessions.length === 0 ? (
            <span>No saved sessions yet.</span>
          ) : (
            sessions.map((session) => (
              <div className="session-row" key={session.id}>
                <span>
                  {session.correct_answers}/{session.total_questions}
                </span>
                <small>{new Date(session.created_at).toLocaleDateString()}</small>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="panel quiz-panel">
        <div className="panel-heading">
          <h2>{selectedResource?.name ?? "Resource Quiz"}</h2>
          <span>
            {totalAnswered}/{deck.length} answered · {scoreSoFar} correct
          </span>
        </div>
        {error && <p className="error-text">{error}</p>}
        {message && <p className="success-text">{message}</p>}
        {loading ? (
          <EmptyState title="Loading quiz" detail="Building prompts from this resource's tracked terms." />
        ) : !selectedResourceId ? (
          <EmptyState title="Choose a resource" detail="Quizzes are generated from terms captured or saved to a resource." />
        ) : !current ? (
          <EmptyState title="No quiz terms yet" detail="Capture OCR terms or add tracker entries to generate a deck." />
        ) : (
          <div className="quiz-card">
            <div className="quiz-progress">
              <span>{current.promptType}</span>
              <strong>
                Prompt {index + 1} of {deck.length}
              </strong>
            </div>
            <div className="quiz-prompt">{current.prompt}</div>
            <label>
              Your answer
              <input
                value={answer}
                onChange={(event) => {
                  setAnswer(event.target.value);
                  setFeedback(null);
                }}
                placeholder="Meaning or reading"
              />
            </label>
            {feedback && (
              <div className={feedback.correct ? "quiz-feedback good" : "quiz-feedback bad"}>
                {feedback.correct ? <CheckCircle2 size={18} /> : <X size={18} />}
                <span>
                  {feedback.correct ? "Correct" : "Expected"}: {current.expectedAnswer}
                </span>
              </div>
            )}
            <div className="button-row">
              <button className="secondary-button" type="button" disabled={Boolean(feedback)} onClick={checkAnswer}>
                <Target size={17} />
                Check
              </button>
              <button className="primary-button" type="button" onClick={() => void advance()}>
                <Play size={17} />
                {index < deck.length - 1 ? "Next" : "Finish"}
              </button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

function isAnswerCorrect(answer: string, expected: string) {
  const normalizedAnswer = normalizeQuizText(answer);
  if (!normalizedAnswer) {
    return false;
  }

  return expected
    .split(/[;；,、\/]| or /i)
    .map(normalizeQuizText)
    .filter(Boolean)
    .some((candidate) => candidate === normalizedAnswer || candidate.includes(normalizedAnswer));
}

function normalizeQuizText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function LookupView() {
  const [query, setQuery] = useState("");
  const [kanji, setKanji] = useState<Kanji[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setKanji([]);
      setWords([]);
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
                  JLPT {item.jlptLevel ?? "-"} · {item.strokeCount ?? "-"} strokes
                </small>
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
            {words.map((word) => (
              <article className="word-card" key={word.id}>
                <div>
                  <strong>{word.kanjiForms[0] ?? word.readings[0] ?? word.entryId}</strong>
                  <span>{word.readings.join(" · ")}</span>
                </div>
                <p>{word.glosses.slice(0, 3).join("; ")}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function OcrView() {
  const [result, setResult] = useState<OcrResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      setResult(await api.ocrImage(file));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "OCR failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="split-view">
      <div className="panel upload-panel">
        <FileImage size={28} />
        <h2>Image OCR</h2>
        <p>Send a screenshot or cropped text image to the local OCR service.</p>
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
        {error && <p className="error-text">{error}</p>}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>Extracted Text</h2>
          <span>{result?.elements.length ?? 0} elements</span>
        </div>
        {!result ? (
          <EmptyState title="No OCR result yet" detail="Run the local OCR service and upload an image." />
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
          </>
        )}
      </section>
    </section>
  );
}

function DrawView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const currentStroke = useRef<Array<{ x: number; y: number }>>([]);
  const [paths, setPaths] = useState<Array<{ paths: Array<{ x: number; y: number }> }>>([]);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 8;
    context.lineCap = "round";
    context.strokeStyle = "#1b1b1b";
    for (const path of paths) {
      context.beginPath();
      path.paths.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      });
      context.stroke();
    }
  }, [paths]);

  function pointFor(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height
    };
  }

  async function recognize() {
    setError(null);
    try {
      setResult(await api.recognize(paths));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Recognition failed");
    }
  }

  return (
    <section className="split-view">
      <div className="panel draw-panel">
        <canvas
          ref={canvasRef}
          width={420}
          height={420}
          onPointerDown={(event) => {
            drawing.current = true;
            currentStroke.current = [pointFor(event)];
            setPaths((existing) => [...existing, { paths: currentStroke.current }]);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drawing.current) {
              return;
            }
            currentStroke.current = [...currentStroke.current, pointFor(event)];
            setPaths((existing) => [
              ...existing.slice(0, -1),
              { paths: currentStroke.current }
            ]);
          }}
          onPointerUp={() => {
            drawing.current = false;
            if (currentStroke.current.length <= 1) {
              setPaths((existing) => existing.slice(0, -1));
            }
            currentStroke.current = [];
          }}
        />
        <div className="button-row">
          <button className="primary-button" type="button" onClick={() => void recognize()}>
            <Sparkles size={17} />
            Recognize
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setPaths([]);
              setResult(null);
            }}
          >
            Clear
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>Matches</h2>
          <span>{result?.stroke_count ?? paths.length} strokes</span>
        </div>
        {!result ? (
          <EmptyState title="Draw a kanji" detail="The local recognition service returns ranked candidates." />
        ) : (
          <div className="recognition-list">
            {result.results?.map((item) => (
              <div className="candidate" key={item.kanji}>
                <strong>{item.kanji}</strong>
                <span>{Math.round(item.score * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function SpeechView() {
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
