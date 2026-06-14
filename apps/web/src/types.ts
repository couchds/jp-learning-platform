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

export type ServiceHealth = {
  service: string;
  url: string;
  health?: unknown;
  available?: boolean;
  error?: string;
};

export type OcrResult = {
  rawText: string;
  elements: Array<{
    text: string;
    element_type: string;
    features: Record<string, unknown>;
  }>;
  terms?: Array<Omit<ResourceTerm, "id" | "resourceId" | "createdAt" | "updatedAt">>;
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
  apiUrl: string;
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
