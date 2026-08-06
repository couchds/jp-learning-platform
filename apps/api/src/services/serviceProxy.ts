import fs from "node:fs/promises";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";

type ProxyOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function getJson<T>(url: string, options: ProxyOptions = {}): Promise<T> {
  return requestJson<T>(url, {}, options);
}

export async function postJson<T>(url: string, body: unknown, options: ProxyOptions = {}): Promise<T> {
  return requestJson<T>(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {})
    },
    options
  );
}

export async function postFile<T>(
  url: string,
  fieldName: string,
  filePath: string,
  filename: string,
  mimeType: string,
  extraFields: Record<string, string> = {},
  options: ProxyOptions = {}
): Promise<T> {
  const stat = await fs.stat(filePath);
  if (stat.size > config.proxyFileLimitBytes) {
    throw new HttpError(413, `Upload exceeds the ${config.proxyFileLimitBytes}-byte proxy limit`);
  }

  const formData = new FormData();
  const file = await fs.readFile(filePath);
  formData.append(fieldName, new Blob([file], { type: mimeType }), filename);
  for (const [key, value] of Object.entries(extraFields)) {
    formData.append(key, value);
  }

  return requestJson<T>(
    url,
    { method: "POST", body: formData },
    { ...options, timeoutMs: options.timeoutMs ?? config.serviceUploadTimeoutMs }
  );
}

async function requestJson<T>(url: string, init: RequestInit, options: ProxyOptions): Promise<T> {
  const timeoutMs = options.timeoutMs ?? config.serviceRequestTimeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  const abortFromParent = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await safeJson(response);
    if (!response.ok) {
      throw new HttpError(response.status, `Local service request failed: ${serviceName(url)}`, payload);
    }
    return payload as T;
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof HttpError)) {
      throw new HttpError(504, `Timed out waiting for ${serviceName(url)}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}

async function safeJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    return {};
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > config.serviceResponseLimitBytes) {
      await reader.cancel();
      throw new HttpError(502, `Local service response exceeded ${config.serviceResponseLimitBytes} bytes`);
    }
    chunks.push(value);
  }

  if (size === 0) {
    return {};
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks));
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function serviceName(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return "local companion service";
  }
}
