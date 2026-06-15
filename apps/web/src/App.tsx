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
import { api } from "./api";
import {
  EventSourceBars,
  KanjiKnowledgeNetwork,
  KanjiXpTimeline,
  KnowledgeCompositionDonut,
  TopKanjiBarChart
} from "./KnowledgeVisuals";
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
} from "./types";

type View =
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
  | "speech";

type Loadable<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

type NavItem = { id: View; label: string; icon: typeof Gauge };

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
  speech: "/speech"
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
  speech: "Inspect pronunciation tooling and training commands."
};

export function App() {
  const view = viewFromPath(window.location.pathname);
  const [dashboard, setDashboard] = useState<Loadable<Dashboard>>({
    data: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    void refreshDashboard();
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

  const activeTitle = navItems.find((item) => item.id === view)?.label ?? "Dashboard";
  const activeSummary = viewSummaries[view];

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">日</div>
          <div>
            <strong>Yomunami</strong>
            <span>Japanese study desk</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Main sections">
          {navGroups.map((group) => (
            <div className="nav-section" role="group" aria-label={group.label} key={group.label}>
              <span className="nav-section-label">{group.label}</span>
              <div className="nav-section-items">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  return (
                    <a
                      key={item.id}
                      className={active ? "nav-button active" : "nav-button"}
                      href={viewRoutes[item.id]}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

      </aside>

      <main className="workspace" id="main-content">
        <header className="topbar">
          <div className="topbar-copy">
            <span className="eyebrow">Japanese learning</span>
            <h1>{activeTitle}</h1>
            <p className="topbar-subtitle">{activeSummary}</p>
          </div>
        </header>

        {view === "home" && <HomeView onNavigate={navigateToView} />}
        {view === "dashboard" && (
          <DashboardView state={dashboard} onRefresh={() => void refreshDashboard()} />
        )}
        {view === "database" && <DatabaseView />}
        {view === "profile" && <ProfileView />}
        {view === "capture" && (
          <CaptureView
            onChange={() => void refreshDashboard()}
            onNavigate={navigateToView}
          />
        )}
        {view === "runtime" && <RuntimeView />}
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

function HomeView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [resources, setResources] = useState<Loadable<Resource[]>>({
    data: [],
    loading: true,
    error: null
  });

  useEffect(() => {
    void loadResources();
  }, []);

  async function loadResources() {
    setResources((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await api.resources("?limit=12");
      setResources({ data: response.items, loading: false, error: null });
    } catch (requestError) {
      setResources({
        data: [],
        loading: false,
        error: requestError instanceof Error ? requestError.message : "Could not load resources"
      });
    }
  }

  const resourceItems = resources.data ?? [];

  return (
    <section className="home-view">
      <section className="panel home-resource-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Resources</span>
            <h2>What are you studying?</h2>
          </div>
          <div className="button-row">
            <button
              className="icon-button"
              type="button"
              aria-label="Refresh resources"
              title="Refresh resources"
              onClick={() => void loadResources()}
            >
              <RotateCcw size={16} />
            </button>
            <button className="primary-button compact-button" type="button" onClick={() => onNavigate("resources")}>
              <Plus size={16} />
              Add resource
            </button>
          </div>
        </div>
        {resources.error && <p className="error-text">{resources.error}</p>}
        {resources.loading ? (
          <EmptyState title="Loading resources" detail="Reading your shelf." />
        ) : resourceItems.length === 0 ? (
          <EmptyState title="Your shelf is empty" detail="Add a game, manga, book, show, or site to start tracking Japanese from it." />
        ) : (
          <div className="home-resource-list">
            {resourceItems.map((resource) => (
              <article className="home-resource-row" key={resource.id}>
                <div className="home-resource-main">
                  <span className="resource-type">{resource.type.replace("_", " ")}</span>
                  <h3>{resource.name}</h3>
                  {resource.description && <p>{resource.description}</p>}
                </div>
                {resource.tags.length > 0 && (
                  <div className="tag-list home-resource-tags">
                    {resource.tags.slice(0, 3).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}
                <div className="button-row">
                  <button className="mini-button" type="button" onClick={() => onNavigate("tracker")}>
                    Tracker
                  </button>
                  <button className="mini-button" type="button" onClick={() => onNavigate("quiz")}>
                    Quiz
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
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
          <h2>{state.loading ? "Loading workspace" : "Ready"}</h2>
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

function DatabaseView() {
  const [activeTab, setActiveTab] = useState<DatabaseTab>("words");
  const [queries, setQueries] = useState<Record<DatabaseTab, string>>(defaultDatabaseQueries);
  const [summary, setSummary] = useState<Loadable<DataSummary>>({
    data: null,
    loading: true,
    error: null
  });
  const [kanjiLevel, setKanjiLevel] = useState<KanjiLevelFilter | null>(null);
  const [words, setWords] = useState<Loadable<Word[]>>({ data: [], loading: false, error: null });
  const [kanji, setKanji] = useState<Loadable<Kanji[]>>({ data: [], loading: false, error: null });
  const [sentences, setSentences] = useState<Loadable<SentenceExample[]>>({
    data: [],
    loading: false,
    error: null
  });
  const [graph, setGraph] = useState<Loadable<KanjiGraph>>({ data: null, loading: false, error: null });
  const [importJobs, setImportJobs] = useState<Loadable<ImportJob[]>>({
    data: [],
    loading: true,
    error: null
  });
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importSubmitting, setImportSubmitting] = useState<ImportJob["jobType"] | null>(null);
  const query = queries[activeTab];
  const setActiveQuery = (value: string) => {
    setQueries((current) => ({ ...current, [activeTab]: value }));
  };

  useEffect(() => {
    void loadSummary();
    void loadImportJobs();
  }, []);

  useEffect(() => {
    if (!importJobs.data?.some((job) => job.status === "running" || job.status === "queued")) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadImportJobs();
      void loadSummary();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [importJobs.data]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void runDatabaseSearch(activeTab, query);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [activeTab, query, kanjiLevel]);

  async function loadSummary() {
    setSummary((current) => ({ ...current, loading: true, error: null }));
    try {
      setSummary({ data: await api.dataSummary(), loading: false, error: null });
    } catch (requestError) {
      setSummary({
        data: null,
        loading: false,
        error: requestError instanceof Error ? requestError.message : "Could not load data summary"
      });
    }
  }

  async function loadImportJobs() {
    setImportJobs((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await api.importJobs(8);
      setImportJobs({ data: response.items, loading: false, error: null });
    } catch (requestError) {
      setImportJobs({
        data: [],
        loading: false,
        error: requestError instanceof Error ? requestError.message : "Could not load import jobs"
      });
    }
  }

  async function startImportJob(action: ImportAction) {
    setImportSubmitting(action.jobType);
    setImportMessage(null);
    setImportJobs((current) => ({ ...current, error: null }));

    try {
      const response = await api.createImportJob({
        jobType: action.jobType,
        ...action.payload
      });
      setImportMessage(`Started ${labelForImportJob(response.job.jobType)} job #${response.job.id}.`);
      await loadImportJobs();
      await loadSummary();
    } catch (requestError) {
      setImportJobs({
        data: importJobs.data ?? [],
        loading: false,
        error: requestError instanceof Error ? requestError.message : "Could not start import job"
      });
    } finally {
      setImportSubmitting(null);
    }
  }

  async function runDatabaseSearch(tab: DatabaseTab, value: string) {
    if (tab === "words") {
      setWords((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await api.words(value.trim());
        setWords({ data: response.items, loading: false, error: null });
      } catch (requestError) {
        setWords({ data: [], loading: false, error: requestError instanceof Error ? requestError.message : "Word search failed" });
      }
      return;
    }

    if (tab === "kanji") {
      setKanji((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await api.kanji(value.trim(), kanjiLevel);
        setKanji({ data: response.items, loading: false, error: null });
      } catch (requestError) {
        setKanji({ data: [], loading: false, error: requestError instanceof Error ? requestError.message : "Kanji search failed" });
      }
      return;
    }

    if (tab === "sentences") {
      setSentences((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await api.sentences(value.trim());
        setSentences({ data: response.items, loading: false, error: null });
      } catch (requestError) {
        setSentences({
          data: [],
          loading: false,
          error: requestError instanceof Error ? requestError.message : "Sentence search failed"
        });
      }
      return;
    }

    const literal = [...value.trim()][0];
    if (!literal) {
      setGraph({ data: null, loading: false, error: null });
      return;
    }

    setGraph((current) => ({ ...current, loading: true, error: null }));
    try {
      setGraph({ data: await api.kanjiGraph(literal), loading: false, error: null });
    } catch (requestError) {
      setGraph({
        data: null,
        loading: false,
        error: requestError instanceof Error ? requestError.message : "Kanji graph lookup failed"
      });
    }
  }

  const counts = summary.data?.counts;
  const dataStats = [
    ["Kanji", counts?.kanji ?? 0, BookOpen],
    ["Words", counts?.words ?? 0, Sparkles],
    ["Sentences", counts?.sentences ?? 0, ClipboardList],
    ["Graph edges", counts?.kanjiRelations ?? 0, Brain]
  ] as const;
  const placeholder = {
    words: "Search words, readings, or English glosses",
    kanji: "Search kanji, readings, or meanings",
    sentences: "Search Japanese or English sentence examples",
    graph: "Enter one kanji to explore similar kanji"
  }[activeTab];

  return (
    <section className="database-view">
      <div className="status-band database-hero">
        <div>
          <span className="eyebrow">Database explorer</span>
          <h2>Words, kanji, examples, and relation graphs</h2>
          <p className="helper-text">
            Import public datasets, then browse them with search, examples, and graph explanations.
          </p>
          {summary.error && <p className="error-text">{summary.error}</p>}
        </div>
        <button className="primary-button" type="button" onClick={() => void loadSummary()}>
          <Activity size={17} />
          Refresh data
        </button>
      </div>

      <div className="metrics-grid">
        {dataStats.map(([label, value, Icon]) => (
          <article className="metric-card" key={label}>
            <Icon size={18} />
            <strong>{value.toLocaleString()}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>

      <ImportManager
        jobs={importJobs}
        message={importMessage}
        submitting={importSubmitting}
        onRefresh={() => {
          void loadImportJobs();
          void loadSummary();
        }}
        onStart={(action) => void startImportJob(action)}
      />

      <section className="panel database-panel">
        <div className="database-toolbar">
          <div className="database-tabs" role="tablist" aria-label="Database sections">
            {(["words", "kanji", "sentences", "graph"] as const).map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "database-tab active" : "database-tab"}
                type="button"
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="searchbar database-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setActiveQuery(event.target.value)}
              placeholder={placeholder}
            />
            {query && (
              <button type="button" aria-label="Clear database search" onClick={() => setActiveQuery("")}>
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        {activeTab === "kanji" && (
          <div className="kanji-level-tabs" aria-label="Kanji JLPT level">
            {kanjiLevelFilters.map((item) => (
              <button
                key={item.label}
                className={kanjiLevel === item.value ? "kanji-level-tab active" : "kanji-level-tab"}
                type="button"
                onClick={() => setKanjiLevel(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {activeTab === "words" && <WordDatabaseResults state={words} />}
        {activeTab === "kanji" && <KanjiDatabaseResults state={kanji} />}
        {activeTab === "sentences" && <SentenceDatabaseResults state={sentences} />}
        {activeTab === "graph" && <KanjiGraphResults state={graph} query={query} />}
      </section>
    </section>
  );
}

function ImportManager({
  jobs,
  message,
  submitting,
  onRefresh,
  onStart
}: {
  jobs: Loadable<ImportJob[]>;
  message: string | null;
  submitting: ImportJob["jobType"] | null;
  onRefresh: () => void;
  onStart: (action: ImportAction) => void;
}) {
  return (
    <section className="panel import-panel">
      <div className="panel-heading">
        <h2>Import Data</h2>
        <button className="secondary-button compact-button" type="button" onClick={onRefresh}>
          <RotateCcw size={16} />
          Refresh
        </button>
      </div>
      <div className="import-action-grid">
        {importActions.map((action) => (
          <button
            className="import-action-button"
            type="button"
            key={action.jobType}
            disabled={submitting !== null}
            onClick={() => onStart(action)}
          >
            <Play size={17} />
            <span>
              <strong>{submitting === action.jobType ? "Starting..." : action.title}</strong>
              <small>{action.detail}</small>
            </span>
          </button>
        ))}
      </div>
      {message && <p className="success-text">{message}</p>}
      {jobs.error && <p className="error-text">{jobs.error}</p>}
      <ImportJobList jobs={jobs} />
    </section>
  );
}

function ImportJobList({ jobs }: { jobs: Loadable<ImportJob[]> }) {
  if (jobs.loading && (!jobs.data || jobs.data.length === 0)) {
    return <EmptyState title="Loading jobs" detail="Reading recent import jobs." />;
  }

  if (!jobs.data || jobs.data.length === 0) {
    return <EmptyState title="No import jobs yet" detail="Choose an import to begin." />;
  }

  return (
    <div className="import-job-list">
      {jobs.data.map((job) => (
        <article className="import-job-row" key={job.id}>
          <div>
            <strong>{labelForImportJob(job.jobType)}</strong>
            <small>{descriptionForImportJob(job)}</small>
          </div>
          <span className={`status-pill ${job.status === "failed" ? "error" : job.status === "completed" ? "ok" : "warn"}`}>
            {job.status}
          </span>
          <small>{job.exitCode == null ? "exit pending" : `exit ${job.exitCode}`}</small>
        </article>
      ))}
    </div>
  );
}

function labelForImportJob(jobType: ImportJob["jobType"]) {
  return {
    starter_data: "Starter data",
    kanjidic2: "KANJIDIC2",
    jmdict: "JMdict",
    sentence_examples: "Sentences",
    kanji_graph: "Kanji graph"
  }[jobType];
}

function descriptionForImportJob(job: ImportJob) {
  if (job.jobType === "starter_data") {
    return "No file needed";
  }
  if (job.jobType === "kanji_graph") {
    return "Built from imported kanji";
  }
  if (job.jobType === "kanjidic2" || job.jobType === "jmdict") {
    return "Saved in the import folder";
  }
  return "Saved sentence TSV";
}

function WordDatabaseResults({ state }: { state: Loadable<Word[]> }) {
  if (state.loading) {
    return <EmptyState title="Searching words" detail="Reading JMdict entries." />;
  }

  if (state.error) {
    return <p className="error-text">{state.error}</p>;
  }

  if (!state.data || state.data.length === 0) {
    return <EmptyState title="No words found" detail="Import JMdict or try a different search." />;
  }

  return (
    <div className="database-result-grid">
      {state.data.map((word) => (
        <article className="database-result-card" key={word.id}>
          <div className="result-card-heading">
            <strong>{wordKnowledgeKey(word)}</strong>
            <span>#{word.entryId}</span>
          </div>
          <p>{word.readings.join(" · ") || "No readings"}</p>
          <small>{word.glosses.slice(0, 5).join("; ") || "No glosses"}</small>
          {word.partsOfSpeech.length > 0 && (
            <div className="tag-list">
              {word.partsOfSpeech.slice(0, 4).map((part) => (
                <span key={part}>{part}</span>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function KanjiDatabaseResults({ state }: { state: Loadable<Kanji[]> }) {
  if (state.loading) {
    return <EmptyState title="Searching kanji" detail="Reading KANJIDIC2 metadata." />;
  }

  if (state.error) {
    return <p className="error-text">{state.error}</p>;
  }

  if (!state.data || state.data.length === 0) {
    return <EmptyState title="No kanji found" detail="Import KANJIDIC2 or try a different search." />;
  }

  return (
    <div className="kanji-database-grid">
      {state.data.map((item) => (
        <article className="database-kanji-card" key={item.id}>
          <strong>{item.literal}</strong>
          <div>
            <span>{item.meanings.slice(0, 4).join(", ") || "No meaning"}</span>
            <small>
              {kanjiJlptLabel(item.jlptLevel)} · {item.strokeCount ?? "-"} strokes · #{item.frequencyRank ?? "-"}
            </small>
          </div>
          <p>{[...item.onReadings.slice(0, 3), ...item.kunReadings.slice(0, 3)].join(" · ") || "No readings"}</p>
        </article>
      ))}
    </div>
  );
}

function SentenceDatabaseResults({ state }: { state: Loadable<SentenceExample[]> }) {
  if (state.loading) {
    return <EmptyState title="Searching examples" detail="Reading sentence examples." />;
  }

  if (state.error) {
    return <p className="error-text">{state.error}</p>;
  }

  if (!state.data || state.data.length === 0) {
    return <EmptyState title="No sentence examples found" detail="Import a sentence TSV or try another search." />;
  }

  return (
    <div className="sentence-list">
      {state.data.map((sentence) => (
        <article className="sentence-card" key={sentence.id}>
          <div>
            <strong>{sentence.japanese}</strong>
            {sentence.reading && <span>{sentence.reading}</span>}
          </div>
          <p>{sentence.english || "No translation"}</p>
          <div className="sentence-meta">
            <small>{sentence.source}{sentence.sourceId ? `:${sentence.sourceId}` : ""}</small>
            <div className="tag-list">
              {sentence.terms.slice(0, 8).map((term) => (
                <span key={term}>{term}</span>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function KanjiGraphResults({ state, query }: { state: Loadable<KanjiGraph>; query: string }) {
  if (!query.trim()) {
    return <EmptyState title="Choose a kanji" detail="Enter one kanji to see similarity edges and reasons." />;
  }

  if (state.loading) {
    return <EmptyState title="Loading graph" detail="Reading precomputed kanji similarity edges." />;
  }

  if (state.error) {
    return <p className="error-text">{state.error}</p>;
  }

  if (!state.data || state.data.relations.length === 0) {
    return <EmptyState title="No graph edges yet" detail="Run the kanji graph builder after importing KANJIDIC2." />;
  }

  return (
    <div className="graph-layout">
      <KanjiGraphMap graph={state.data} />
      <div className="relation-list">
        {state.data.relations.slice(0, 12).map((relation) => (
          <article className="relation-card" key={relation.id}>
            <div className="result-card-heading">
              <strong>{relation.targetLiteral}</strong>
              <span>{Math.round(relation.score)} score</span>
            </div>
            <p>{relation.target.meanings.slice(0, 4).join(", ") || "No meaning"}</p>
            <small>{relation.reasons.slice(0, 3).map((reason) => reason.detail).join(" · ")}</small>
          </article>
        ))}
      </div>
    </div>
  );
}

function KanjiGraphMap({ graph }: { graph: KanjiGraph }) {
  const width = 760;
  const height = 360;
  const center = { x: width / 2, y: height / 2 };
  const related = graph.nodes.filter((node) => node.kind === "related").slice(0, 16);
  const radius = 132;
  const positioned = related.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(related.length, 1) - Math.PI / 2;
    return {
      ...node,
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    };
  });

  return (
    <svg className="kanji-graph-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Kanji relation graph">
      {positioned.map((node) => (
        <line key={`${graph.center.literal}-${node.literal}`} x1={center.x} y1={center.y} x2={node.x} y2={node.y} />
      ))}
      <circle className="graph-center-node" cx={center.x} cy={center.y} r="44" />
      <text className="graph-center-text" x={center.x} y={center.y + 11} textAnchor="middle">
        {graph.center.literal}
      </text>
      {positioned.map((node) => (
        <g key={node.literal}>
          <circle className="graph-related-node" cx={node.x} cy={node.y} r="30" />
          <text x={node.x} y={node.y + 9} textAnchor="middle">
            {node.literal}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ProfileView() {
  const [summary, setSummary] = useState<Loadable<KnowledgeSummary>>({
    data: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    void loadSummary();
  }, []);

  async function loadSummary() {
    setSummary((current) => ({ ...current, loading: true, error: null }));
    try {
      setSummary({ data: await api.knowledgeSummary(30), loading: false, error: null });
    } catch (requestError) {
      setSummary({
        data: null,
        loading: false,
        error: requestError instanceof Error ? requestError.message : "Could not load knowledge profile"
      });
    }
  }

  const totals = summary.data?.totals;
  const profileStats = [
    {
      label: "Known kanji",
      value: totals?.kanji.known ?? 0,
      detail: `${totals?.kanji.tracked ?? 0} tracked`,
      icon: Brain
    },
    {
      label: "Kanji XP",
      value: totals?.kanji.xp ?? 0,
      detail: "from correct quiz answers",
      icon: Trophy
    },
    {
      label: "Known words",
      value: totals?.words.known ?? 0,
      detail: `${totals?.words.tracked ?? 0} tracked`,
      icon: Sparkles
    },
    {
      label: "Custom terms",
      value: totals?.customVocabulary.tracked ?? 0,
      detail: `${totals?.customVocabulary.xp ?? 0} XP`,
      icon: ClipboardList
    }
  ] as const;

  return (
    <section className="profile-view">
      <div className="status-band">
        <div>
          <span className="eyebrow">Knowledge profile</span>
          <h2>{summary.loading ? "Loading study profile" : "Kanji and word tracking"}</h2>
          <p className="helper-text">
            Kanji XP comes from correct quiz answers. Captures and tracker entries build the resource decks you quiz from.
          </p>
          {summary.error && <p className="error-text">{summary.error}</p>}
        </div>
        <button className="primary-button" type="button" onClick={() => void loadSummary()}>
          <Activity size={17} />
          Refresh
        </button>
      </div>

      <div className="metrics-grid">
        {profileStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article className="metric-card" key={stat.label}>
              <Icon size={18} />
              <strong>{stat.value.toLocaleString()}</strong>
              <span>{stat.label}</span>
              <small>{stat.detail}</small>
            </article>
          );
        })}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>Kanji XP Over Time</h2>
          <span>last 30 days</span>
        </div>
        {summary.data ? (
          <KanjiXpTimeline history={summary.data.kanjiXpHistory} />
        ) : summary.loading ? (
          <EmptyState title="Loading profile graph" detail="Reading kanji experience history." />
        ) : (
          <EmptyState title="No profile data yet" detail="Finish a resource quiz with kanji prompts to build an XP history." />
        )}
      </section>

      {summary.data ? (
        <div className="analytics-dashboard-grid">
          <KnowledgeCompositionDonut totals={summary.data.totals} />
          <section className="panel analytics-card analytics-card-wide">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Kanji ranking</span>
                <h2>Most Experienced Kanji</h2>
              </div>
              <span>{summary.data.topKanji.length} shown</span>
            </div>
            <TopKanjiBarChart items={summary.data.topKanji} />
          </section>
        </div>
      ) : summary.loading ? (
        <section className="panel">
          <EmptyState title="Loading analytics" detail="Reading your knowledge profile." />
        </section>
      ) : null}

      {summary.data ? (
        <div className="analytics-dashboard-grid network-dashboard-grid">
          <section className="panel analytics-card analytics-card-wide">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Relationship map</span>
                <h2>Kanji Knowledge Network</h2>
              </div>
              <span>{summary.data.kanjiNetwork.nodes.length} nodes</span>
            </div>
            <KanjiKnowledgeNetwork network={summary.data.kanjiNetwork} />
          </section>
          <section className="panel analytics-card">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Activity sources</span>
                <h2>Where XP Comes From</h2>
              </div>
              <span>last 30 days</span>
            </div>
            <EventSourceBars items={summary.data.eventSourceBreakdown} />
          </section>
        </div>
      ) : null}
    </section>
  );
}

function RuntimeView() {
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

function CaptureView({
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
          <EmptyState title="Your shelf is empty" detail="Create a resource to start attaching words, kanji, OCR captures, and notes." />
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
  const [wordLookupQuery, setWordLookupQuery] = useState("");
  const [wordLookup, setWordLookup] = useState<Loadable<Word[]>>({
    data: [],
    loading: false,
    error: null
  });
  const [trackingWordId, setTrackingWordId] = useState<number | null>(null);
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

  const terms = detail.data?.terms ?? [];
  const dictionaryWords = detail.data?.words ?? [];
  const kanjiCount = terms.filter((term) => term.termType === "kanji").length;
  const wordCount = terms.filter((term) => term.termType === "word").length + dictionaryWords.length;
  const selectedResource = resources.find((resource) => resource.id === selectedResourceId);
  const trackedWordIds = new Set(dictionaryWords.map((word) => word.id));
  const trackedCount = terms.length + dictionaryWords.length;

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
            <strong>{trackedCount}</strong>
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
          <span>{detail.loading ? "loading" : `${trackedCount} tracked`}</span>
        </div>
        {detail.error && <p className="error-text">{detail.error}</p>}
        {!selectedResourceId ? (
          <EmptyState title="Pick a resource" detail="Tracked OCR terms and manual vocabulary are grouped by source." />
        ) : trackedCount === 0 ? (
          <EmptyState title="No terms yet" detail="Look up a dictionary word, use Capture, or add a term manually." />
        ) : (
          <div className="tracked-resource-content">
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
          </div>
        )}
      </section>
    </section>
  );
}

function wordDisplay(word: Word) {
  return word.kanjiForms[0] ?? word.readings[0] ?? `#${word.entryId}`;
}

function QuizView() {
  const advancing = useRef(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [deck, setDeck] = useState<QuizQuestion[]>([]);
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answered, setAnswered] = useState<QuizAnswerPayload[]>([]);
  const [feedback, setFeedback] = useState<QuizAnswerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
    if (submitting || advancing.current) {
      return;
    }

    const currentAnswer = buildAnswer();
    if (currentAnswer) {
      setFeedback(currentAnswer);
    }
  }

  async function advance() {
    if (submitting || advancing.current) {
      return;
    }

    const currentAnswer = feedback ?? buildAnswer();
    if (!currentAnswer || !selectedResourceId) {
      return;
    }

    advancing.current = true;
    const nextAnswers = [...answered, currentAnswer];
    if (index < deck.length - 1) {
      setAnswered(nextAnswers);
      setIndex((current) => current + 1);
      setAnswer("");
      setFeedback(null);
      window.setTimeout(() => {
        advancing.current = false;
      }, 0);
      return;
    }

    setSubmitting(true);
    try {
      await api.saveQuizSession(selectedResourceId, nextAnswers);
      const correct = nextAnswers.filter((item) => item.correct).length;
      await loadQuiz(selectedResourceId);
      setMessage(`Quiz saved: ${correct}/${nextAnswers.length} correct.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save quiz session");
    } finally {
      advancing.current = false;
      setSubmitting(false);
    }
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
              <button
                className="secondary-button"
                type="button"
                disabled={Boolean(feedback) || submitting}
                onClick={checkAnswer}
              >
                <Target size={17} />
                Check
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={submitting}
                onClick={() => void advance()}
              >
                <Play size={17} />
                {submitting ? "Saving..." : index < deck.length - 1 ? "Next" : "Finish"}
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
    .some((candidate) => candidate === normalizedAnswer);
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
        <p>Send a screenshot or cropped text image through OCR.</p>
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
          <EmptyState title="No OCR result yet" detail="Start OCR and upload an image." />
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
          <EmptyState title="Draw a kanji" detail="Recognition returns ranked candidates." />
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
