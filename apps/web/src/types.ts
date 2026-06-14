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
};

export type RecognitionResult = {
  success: boolean;
  stroke_count?: number;
  results?: Array<{ kanji: string; score: number }>;
  error?: string;
};
