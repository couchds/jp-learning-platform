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

export function ProfileView() {
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
