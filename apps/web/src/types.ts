export type Page<T> = {
  items: T[];
  page: {
    limit: number;
    offset: number;
    total: number;
  };
};

export type Dashboard = {
  counts: {
    resources: number;
    kanji: number;
    words: number;
    images: number;
    pronunciationRecordings: number;
    dueReviews: number;
  };
  recentResources: Array<{
    id: number;
    name: string;
    type: string;
    status: string;
    updated_at: string;
  }>;
};

export type DataSummary = {
  counts: {
    kanji: number;
    words: number;
    sentences: number;
    sentenceTerms: number;
    kanjiRelations: number;
    knowledgeItems: number;
    resources: number;
  };
  latestUpdatedAt: string | null;
};

export type Resource = {
  id: number;
  name: string;
  type: string;
  status: string;
  description: string | null;
  difficultyLevel: string | null;
  coverImagePath: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type ResourceTerm = {
  id: number;
  resourceId: number;
  termType: "kanji" | "word" | "phrase" | "kana" | "unknown";
  text: string;
  reading: string | null;
  meaning: string | null;
  source: string;
  sourceImageId: number | null;
  frequency: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResourceDetail = {
  resource: Resource;
  kanji: Array<Kanji & { resource?: { frequency: number; notes: string | null } }>;
  words: Array<Word & { resource?: { frequency: number; notes: string | null } }>;
  customVocabulary: Array<{
    id: number;
    resource_id: number;
    word: string;
    reading: string | null;
    meaning: string | null;
    frequency: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>;
  terms: ResourceTerm[];
  images: Array<{
    id: number;
    resourceId: number | null;
    filePath: string;
    originalName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    ocrText: string | null;
    ocrElements: unknown[];
    createdAt: string;
    updatedAt: string;
  }>;
};

export type Kanji = {
  id: number;
  literal: string;
  strokeCount: number | null;
  grade: number | null;
  frequencyRank: number | null;
  jlptLevel: number | null;
  onReadings: string[];
  kunReadings: string[];
  meanings: string[];
};

export type Word = {
  id: number;
  entryId: number;
  kanjiForms: string[];
  readings: string[];
  glosses: string[];
  partsOfSpeech: string[];
};

export type SentenceExample = {
  id: number;
  source: string;
  sourceId: string | null;
  japanese: string;
  reading: string | null;
  english: string | null;
  metadata: Record<string, unknown>;
  terms: string[];
  createdAt: string;
  updatedAt: string;
};

export type KanjiGraph = {
  center: Kanji;
  nodes: Array<{
    literal: string;
    kind: "center" | "related";
    score?: number;
    meanings?: string[];
  }>;
  edges: Array<{
    source: string;
    target: string;
    relationType: string;
    score: number;
    reasons: Array<{ type: string; detail: string; score: number }>;
  }>;
  relations: Array<{
    id: number;
    sourceLiteral: string;
    targetLiteral: string;
    relationType: string;
    score: number;
    reasons: Array<{ type: string; detail: string; score: number }>;
    target: {
      id: number | null;
      literal: string;
      meanings: string[];
      onReadings: string[];
      kunReadings: string[];
      strokeCount: number | null;
      jlptLevel: number | null;
      frequencyRank: number | null;
    };
  }>;
};

export type ImportJob = {
  id: number;
  jobType: "kanjidic2" | "jmdict" | "sentence_examples" | "kanji_graph";
  status: "queued" | "running" | "completed" | "failed";
  inputPath: string | null;
  args: Record<string, unknown>;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServiceHealth = {
  service: string;
  url: string;
  health?: unknown;
  available?: boolean;
  error?: string;
};

export type KnowledgeItem = {
  id: number;
  itemType: "kanji" | "word" | "custom_vocabulary";
  itemKey: string;
  stage: number;
  lastSeenAt: string | null;
  nextReviewAt: string | null;
  lapses: number;
  xp: number;
  seenCount: number;
  isKnown: boolean;
  knownAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeSummary = {
  totals: {
    kanji: { tracked: number; known: number; xp: number; seen: number };
    words: { tracked: number; known: number; xp: number; seen: number };
    customVocabulary: { tracked: number; known: number; xp: number; seen: number };
  };
  kanjiXpHistory: Array<{
    date: string;
    xpGained: number;
    events: number;
    cumulativeXp: number;
  }>;
  topKanji: Array<{
    itemKey: string;
    xp: number;
    seenCount: number;
    isKnown: boolean;
    lastSeenAt: string | null;
  }>;
};

export type LocalServiceLaunch = {
  launched: boolean;
  alreadyRunning?: boolean;
  alreadyRequested?: boolean;
  pid?: number;
  service: string;
  url: string;
  python?: "venv" | "system";
  pythonDetail?: string;
  available?: boolean;
  health?: unknown;
  error?: string;
};

export type RuntimeDoctorStatus = "ok" | "warn" | "error";

export type RuntimeDoctorCheck = {
  id: string;
  label: string;
  status: RuntimeDoctorStatus;
  detail: string;
  action?: string;
};

export type RuntimeDoctor = {
  summary: RuntimeDoctorStatus;
  checks: RuntimeDoctorCheck[];
};

export type OcrResult = {
  rawText: string;
  elements: Array<{
    text: string;
    element_type: string;
    features: Record<string, unknown>;
    bbox?: {
      x: number;
      y: number;
      width: number;
      height: number;
      points?: Array<{ x: number; y: number }>;
    };
    confidence?: number;
    detection_index?: number;
    bbox_source?: string;
  }>;
  terms?: Array<Omit<ResourceTerm, "id" | "resourceId" | "createdAt" | "updatedAt">>;
  backend?: string;
  activeBackend?: string;
  boxesAvailable?: boolean;
  imageWidth?: number;
  imageHeight?: number;
};

export type RecognitionResult = {
  success: boolean;
  stroke_count?: number;
  results?: Array<{ kanji: string; score: number }>;
  error?: string;
};

export type DesktopOverlayStatus = {
  available: boolean;
  overlay: string;
  appBundle?: "installed" | "missing";
  platform?: string;
  launchTarget?: "app-bundle" | "python";
  launchTargetDetail?: string;
  python?: "venv" | "system";
  pythonDetail?: string;
  apiUrl: string;
  webUrl?: string;
};

export type QuizQuestion = {
  id: string;
  sourceType: string;
  sourceKey: string;
  prompt: string;
  expectedAnswer: string;
  promptType: string;
  frequency: number;
};

export type QuizAnswerPayload = {
  prompt: string;
  answer: string | null;
  expectedAnswer: string | null;
  correct: boolean;
  sourceType: string | null;
  sourceKey: string | null;
};

export type QuizSession = {
  id: number;
  resource_id: number;
  mode: string;
  status: string;
  total_questions: number;
  correct_answers: number;
  completed_at: string | null;
  created_at: string;
};
