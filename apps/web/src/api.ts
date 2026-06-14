import type { Dashboard, Kanji, OcrResult, Page, RecognitionResult, Resource, ServiceHealth, Word } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3001";

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
    throw new Error(message);
  }

  return payload as T;
}

export const api = {
  apiUrl: API_URL,
  health: () => request<unknown>("/health"),
  dashboard: () => request<Dashboard>("/api/dashboard"),
  serviceHealth: async () => {
    const paths = ["/api/ocr/health", "/api/recognize/health", "/api/speech/health"];
    return Promise.all(
      paths.map(async (path) => {
        try {
          return await request<ServiceHealth>(path);
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
  kanji: (search: string) => request<Page<Kanji>>(`/api/kanji?limit=24&search=${encodeURIComponent(search)}`),
  words: (search: string) => request<Page<Word>>(`/api/words?limit=24&search=${encodeURIComponent(search)}`),
  ocrImage: (file: File) => {
    const form = new FormData();
    form.append("image", file);
    return request<OcrResult>("/api/ocr/image", {
      method: "POST",
      body: form
    });
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
