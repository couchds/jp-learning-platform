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

export function DrawView() {
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
