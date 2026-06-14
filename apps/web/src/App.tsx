import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  Boxes,
  Brain,
  Circle,
  Database,
  FileImage,
  Gauge,
  Mic,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Upload,
  X
} from "lucide-react";
import { api } from "./api";
import type { Dashboard, Kanji, OcrResult, RecognitionResult, Resource, ServiceHealth, Word } from "./types";

type View = "dashboard" | "resources" | "lookup" | "ocr" | "draw" | "speech";

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
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "resources", label: "Resources", icon: Boxes },
  { id: "lookup", label: "Lookup", icon: Search },
  { id: "ocr", label: "OCR", icon: FileImage },
  { id: "draw", label: "Draw", icon: Pencil },
  { id: "speech", label: "Speech", icon: Mic }
];

export function App() {
  const [view, setView] = useState<View>("dashboard");
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

        {view === "dashboard" && (
          <DashboardView state={dashboard} onRefresh={() => void refreshDashboard()} />
        )}
        {view === "resources" && <ResourcesView onChange={() => void refreshDashboard()} />}
        {view === "lookup" && <LookupView />}
        {view === "ocr" && <OcrView />}
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
