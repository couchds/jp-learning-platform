import type {
  DataSummary,
  Dashboard,
  DesktopOverlayStatus,
  ImportJob,
  Kanji,
  KanjiGraph,
  KnowledgeItem,
  KnowledgeSummary,
  LocalServiceLaunch,
  OcrResult,
  Page,
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

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3001";

class ApiRequestError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : {
      "content-type": "application/json",
      ...init?.headers
    }
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.error ?? `Request failed with ${response.status}`;
    throw new ApiRequestError(message, response.status, payload);
  }

  return payload as T;
}

async function requestServiceHealth(path: string) {
  try {
    return await request<ServiceHealth>(path);
  } catch (error) {
    if (error instanceof ApiRequestError && error.payload && typeof error.payload === "object") {
      return error.payload as ServiceHealth;
    }

    throw error;
  }
}

export const api = {
  apiUrl: API_URL,
  health: () => request<unknown>("/health"),
  dataSummary: () => request<DataSummary>("/api/data/summary"),
  dashboard: () => request<Dashboard>("/api/dashboard"),
  serviceHealth: async () => {
    const paths = ["/api/ocr/health", "/api/recognize/health", "/api/speech/health"];
    return Promise.all(
      paths.map(async (path) => {
        try {
          return await requestServiceHealth(path);
        } catch (error) {
          return {
            service: path.split("/")[2],
            url: "",
            available: false,
            error: error instanceof Error ? error.message : "Unavailable"
          };
        }
      })
    );
  },
  ocrHealth: () => requestServiceHealth("/api/ocr/health"),
  launchOcrService: () =>
    request<LocalServiceLaunch>("/api/ocr/service/launch", {
      method: "POST",
      body: JSON.stringify({})
    }),
  runtimeDoctor: () => request<RuntimeDoctor>("/api/runtime/doctor"),
  knowledge: (query = "") => request<{ items: KnowledgeItem[] }>(`/api/knowledge${query}`),
  knowledgeSummary: (days = 30) => request<KnowledgeSummary>(`/api/knowledge/summary?days=${days}`),
  markKnowledgeSeen: (item: {
    itemType: KnowledgeItem["itemType"];
    itemKey: string;
    xpDelta?: number;
    source?: string;
  }) =>
    request<{ item: KnowledgeItem }>("/api/knowledge/seen", {
      method: "POST",
      body: JSON.stringify(item)
    }),
  markKnowledgeKnown: (item: {
    itemType: KnowledgeItem["itemType"];
    itemKey: string;
    isKnown?: boolean;
    source?: string;
  }) =>
    request<{ item: KnowledgeItem }>("/api/knowledge/known", {
      method: "POST",
      body: JSON.stringify(item)
    }),
  resources: (query = "") => request<Page<Resource>>(`/api/resources${query}`),
  createResource: (resource: {
    name: string;
    type: string;
    status: string;
    difficultyLevel?: string | null;
    description?: string | null;
    tags: string[];
  }) =>
    request<{ resource: Resource }>("/api/resources", {
      method: "POST",
      body: JSON.stringify(resource)
    }),
  resource: (id: number) => request<ResourceDetail>(`/api/resources/${id}`),
  resourceTerms: (id: number) => request<Page<ResourceTerm>>(`/api/resources/${id}/terms?limit=100`),
  addResourceTerm: (
    id: number,
    term: {
      termType: ResourceTerm["termType"];
      text: string;
      reading?: string | null;
      meaning?: string | null;
      source?: string;
      frequency?: number;
      notes?: string | null;
    }
  ) =>
    request<{ terms: ResourceTerm[] }>(`/api/resources/${id}/terms`, {
      method: "POST",
      body: JSON.stringify(term)
    }),
  addResourceWord: (id: number, wordId: number, payload: { frequency?: number; notes?: string | null } = {}) =>
    request<void>(`/api/resources/${id}/words/${wordId}`, {
      method: "POST",
      body: JSON.stringify({
        frequency: payload.frequency ?? 1,
        notes: payload.notes ?? null
      })
    }),
  quizDeck: (id: number, limit = 20) =>
    request<{ questions: QuizQuestion[] }>(`/api/resources/${id}/quiz/deck?limit=${limit}`),
  quizSessions: (id: number) =>
    request<Page<QuizSession>>(`/api/resources/${id}/quiz/sessions?limit=5`),
  saveQuizSession: (id: number, answers: QuizAnswerPayload[]) =>
    request<{ session: QuizSession }>(`/api/resources/${id}/quiz/sessions`, {
      method: "POST",
      body: JSON.stringify({ mode: "resource", answers })
    }),
  desktopOverlayStatus: () => request<DesktopOverlayStatus>("/api/desktop/overlay/status"),
  launchDesktopOverlay: () =>
    request<{
      launched: boolean;
      alreadyRequested?: boolean;
      pid?: number;
      overlay: string;
      launchTarget?: "app-bundle" | "python";
      launchTargetDetail?: string;
      python?: string;
      pythonDetail?: string;
      webUrl?: string;
    }>(
      "/api/desktop/overlay/launch",
      {
        method: "POST",
        body: JSON.stringify({})
      }
    ),
  kanji: (search: string) => request<Page<Kanji>>(`/api/kanji?limit=24&search=${encodeURIComponent(search)}`),
  words: (search: string) => request<Page<Word>>(`/api/words?limit=24&search=${encodeURIComponent(search)}`),
  sentences: (search: string) =>
    request<Page<SentenceExample>>(`/api/sentences?limit=24&search=${encodeURIComponent(search)}`),
  kanjiGraph: (literal: string, limit = 24) =>
    request<KanjiGraph>(`/api/graph/kanji?literal=${encodeURIComponent(literal)}&limit=${limit}`),
  importJobs: (limit = 10) => request<{ items: ImportJob[] }>(`/api/imports/jobs?limit=${limit}`),
  createImportJob: (job: {
    jobType: ImportJob["jobType"];
    inputPath?: string;
    source?: string;
    limit?: number;
    maxEdges?: number;
    maxGroupSize?: number;
  }) =>
    request<{ job: ImportJob }>("/api/imports/jobs", {
      method: "POST",
      body: JSON.stringify(job)
    }),
  ocrImage: (file: File) => {
    const form = new FormData();
    form.append("image", file);
    return request<OcrResult>("/api/ocr/image", {
      method: "POST",
      body: form
    });
  },
  ocrResourceImage: (resourceId: number, file: File, track = true) => {
    const form = new FormData();
    form.append("image", file);
    return request<{ image: unknown; ocr: OcrResult; trackedTerms: ResourceTerm[] }>(
      `/api/ocr/resources/${resourceId}/images?track=${track ? "true" : "false"}`,
      {
        method: "POST",
        body: form
      }
    );
  },
  recognize: (paths: unknown[]) =>
    request<RecognitionResult>("/api/recognize", {
      method: "POST",
      body: JSON.stringify({ paths, limit: 10 })
    }),
  speechInfo: () => request<unknown>("/api/speech/info"),
  exportSpeechData: () =>
    request<unknown>("/api/speech/export-data", { method: "POST", body: JSON.stringify({}) }),
  trainSpeechModel: () =>
    request<unknown>("/api/speech/train", {
      method: "POST",
      body: JSON.stringify({ model: "lightweight", epochs: 20, batch_size: 16, augment: true })
    })
};
