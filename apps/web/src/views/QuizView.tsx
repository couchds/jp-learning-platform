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

import { EmptyState, emptyDashboard, type Loadable, type View } from "./shared";
import { ResourcePicker } from "../components/ResourcePicker";

export function QuizView() {
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
    try {
      const response = await api.resources("?limit=1");
      setResources(response.items);
      setSelectedResourceId((current) => current ?? response.items[0]?.id ?? null);
      if (response.items.length === 0) setLoading(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load resources");
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
          <ResourcePicker value={selectedResourceId} onChange={(id, resource) => {
            setSelectedResourceId(id);
            if (resource) setResources((current) => [...new Map([...current, resource].map((item) => [item.id, item])).values()]);
          }} />
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
