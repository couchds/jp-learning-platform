import fs from "node:fs/promises";
import { HttpError } from "../lib/http.js";

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await safeJson(response);

  if (!response.ok) {
    throw new HttpError(response.status, "Local service request failed", payload);
  }

  return payload as T;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body ?? {})
  });
  const payload = await safeJson(response);

  if (!response.ok) {
    throw new HttpError(response.status, "Local service request failed", payload);
  }

  return payload as T;
}

export async function postFile<T>(
  url: string,
  fieldName: string,
  filePath: string,
  filename: string,
  mimeType: string,
  extraFields: Record<string, string> = {}
): Promise<T> {
  const formData = new FormData();
  const file = await fs.readFile(filePath);
  formData.append(fieldName, new Blob([file], { type: mimeType }), filename);

  for (const [key, value] of Object.entries(extraFields)) {
    formData.append(key, value);
  }

  const response = await fetch(url, {
    method: "POST",
    body: formData
  });
  const payload = await safeJson(response);

  if (!response.ok) {
    throw new HttpError(response.status, "Local service request failed", payload);
  }

  return payload as T;
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
