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

export function HomeView({ onNavigate }: { onNavigate: (view: View) => void }) {
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
