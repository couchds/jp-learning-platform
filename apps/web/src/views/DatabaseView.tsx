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

import { EmptyState, defaultDatabaseQueries, importActions, kanjiJlptLabel, kanjiLevelFilters, wordKnowledgeKey, emptyDashboard, type DatabaseTab, type ImportAction, type KanjiLevelFilter, type Loadable, type View } from "./shared";
import { BackupPanel } from "../components/BackupPanel";
import { Pagination } from "../components/Pagination";

export function DatabaseView() {
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
  const [resultPage, setResultPage] = useState({ limit: 24, offset: 0, total: 0 });
  const query = queries[activeTab];
  const setActiveQuery = (value: string) => {
    setQueries((current) => ({ ...current, [activeTab]: value }));
    setResultPage((current) => ({ ...current, offset: 0 }));
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
    const params = new URLSearchParams({ tab: activeTab });
    if (query.trim()) params.set("q", query.trim());
    if (resultPage.offset) params.set("offset", String(resultPage.offset));
    window.history.replaceState(null, "", `/database?${params}`);
    const timeout = window.setTimeout(() => {
      void runDatabaseSearch(activeTab, query, resultPage.offset);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [activeTab, query, kanjiLevel, resultPage.offset]);

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

  async function cancelImportJob(id: number) {
    setImportMessage(null);
    try {
      await api.cancelImportJob(id);
      setImportMessage(`Cancelled import job #${id}.`);
      await loadImportJobs();
    } catch (requestError) {
      setImportJobs((current) => ({ ...current, error: requestError instanceof Error ? requestError.message : "Could not cancel import job" }));
    }
  }

  async function runDatabaseSearch(tab: DatabaseTab, value: string, offset: number) {
    if (tab === "words") {
      setWords((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await api.words(value.trim(), offset);
        setWords({ data: response.items, loading: false, error: null });
        setResultPage(response.page);
      } catch (requestError) {
        setWords({ data: [], loading: false, error: requestError instanceof Error ? requestError.message : "Word search failed" });
      }
      return;
    }

    if (tab === "kanji") {
      setKanji((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await api.kanji(value.trim(), kanjiLevel, offset);
        setKanji({ data: response.items, loading: false, error: null });
        setResultPage(response.page);
      } catch (requestError) {
        setKanji({ data: [], loading: false, error: requestError instanceof Error ? requestError.message : "Kanji search failed" });
      }
      return;
    }

    if (tab === "sentences") {
      setSentences((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await api.sentences(value.trim(), offset);
        setSentences({ data: response.items, loading: false, error: null });
        setResultPage(response.page);
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
        onCancel={(id) => void cancelImportJob(id)}
      />

      <BackupPanel />

      <section className="panel database-panel">
        <div className="database-toolbar">
          <div className="database-tabs" role="tablist" aria-label="Database sections">
            {(["words", "kanji", "sentences", "graph"] as const).map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "database-tab active" : "database-tab"}
                type="button"
                onClick={() => { setActiveTab(tab); setResultPage((current) => ({ ...current, offset: 0 })); }}
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
                onClick={() => { setKanjiLevel(item.value); setResultPage((current) => ({ ...current, offset: 0 })); }}
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
        {activeTab !== "graph" && <Pagination {...resultPage} onChange={(offset) => setResultPage((current) => ({ ...current, offset }))} />}
      </section>
    </section>
  );
}

function ImportManager({
  jobs,
  message,
  submitting,
  onRefresh,
  onStart,
  onCancel
}: {
  jobs: Loadable<ImportJob[]>;
  message: string | null;
  submitting: ImportJob["jobType"] | null;
  onRefresh: () => void;
  onStart: (action: ImportAction) => void;
  onCancel: (id: number) => void;
}) {
  const active = jobs.data?.some((job) => job.status === "queued" || job.status === "running") === true;
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
            disabled={submitting !== null || active}
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
      <ImportJobList jobs={jobs} onCancel={onCancel} />
    </section>
  );
}

function ImportJobList({ jobs, onCancel }: { jobs: Loadable<ImportJob[]>; onCancel: (id: number) => void }) {
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
          {(job.status === "queued" || job.status === "running") && <button type="button" className="secondary-button compact-button" onClick={() => onCancel(job.id)}>Cancel</button>}
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
