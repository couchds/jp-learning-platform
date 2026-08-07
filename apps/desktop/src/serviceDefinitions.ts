import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { ManagedServiceSpec } from "./serviceSupervisor.js";

type DefinitionOptions = {
  resourceRoot: string;
  isPackaged: boolean;
  platform?: NodeJS.Platform;
};

export function createServiceDefinitions(options: DefinitionOptions): ManagedServiceSpec[] {
  const platform = options.platform ?? process.platform;
  if (options.isPackaged) return packagedDefinitions(options, platform);
  return developmentDefinitions(options, platform);
}

function developmentDefinitions(options: DefinitionOptions, platform: NodeJS.Platform) {
  const definitions = [
    pythonService({
      id: "ocr",
      label: "Text recognition",
      root: path.join(options.resourceRoot, "services/ocr"),
      script: "app.py",
      platform,
      healthUrl: "http://127.0.0.1:5100/health",
      env: { OCR_HOST: "127.0.0.1", OCR_PORT: "5100", OCR_BACKEND: "auto" }
    }),
    pythonService({
      id: "recognition",
      label: "Handwriting recognition",
      root: path.join(options.resourceRoot, "services/recognize"),
      script: "app.py",
      platform,
      healthUrl: "http://127.0.0.1:5000/health",
      env: { RECOGNITION_SERVICE_HOST: "127.0.0.1", RECOGNITION_SERVICE_PORT: "5000" }
    })
  ];
  return definitions.map((definition) => ({ ...definition, startOnLaunch: true, autoRestart: true }));
}

function packagedDefinitions(options: DefinitionOptions, platform: NodeJS.Platform) {
  const executableSuffix = platform === "win32" ? ".exe" : "";
  const sidecarRoot = path.join(options.resourceRoot, "sidecars");
  const values: Array<Omit<ManagedServiceSpec, "available">> = [
    {
      id: "ocr",
      label: "Text recognition",
      command: path.join(sidecarRoot, `kakomu-ocr${executableSuffix}`),
      healthUrl: "http://127.0.0.1:5100/health",
      env: { OCR_HOST: "127.0.0.1", OCR_PORT: "5100", OCR_BACKEND: "auto" },
      startOnLaunch: true,
      autoRestart: true,
      startupTimeoutMs: 90_000
    },
    {
      id: "recognition",
      label: "Handwriting recognition",
      command: path.join(sidecarRoot, `kakomu-recognize${executableSuffix}`),
      healthUrl: "http://127.0.0.1:5000/health",
      env: { RECOGNITION_SERVICE_HOST: "127.0.0.1", RECOGNITION_SERVICE_PORT: "5000" },
      startOnLaunch: true,
      autoRestart: true
    }
  ];
  return values.map((value) => ({
    ...value,
    available: fs.existsSync(value.command),
    unavailableReason: `Missing bundled service: ${path.basename(value.command)}`
  }));
}

function pythonService(options: {
  id: string;
  label: string;
  root: string;
  script: string;
  platform: NodeJS.Platform;
  healthUrl?: string;
  env?: NodeJS.ProcessEnv;
  startupTimeoutMs?: number;
}): ManagedServiceSpec {
  const scriptPath = path.join(options.root, options.script);
  const python = resolvePython(options.root, options.platform);
  return {
    id: options.id,
    label: options.label,
    command: python.command,
    args: [...python.prefix, scriptPath],
    cwd: options.root,
    env: options.env,
    healthUrl: options.healthUrl,
    startupTimeoutMs: options.startupTimeoutMs,
    available: fs.existsSync(scriptPath) && python.available,
    unavailableReason: !fs.existsSync(scriptPath)
      ? `${options.label} is not installed.`
      : "A development Python runtime is not available."
  };
}

function resolvePython(serviceRoot: string, platform: NodeJS.Platform) {
  const venv = platform === "win32"
    ? path.join(serviceRoot, ".venv", "Scripts", "python.exe")
    : path.join(serviceRoot, ".venv", "bin", "python");
  if (fs.existsSync(venv)) return { command: venv, prefix: [] as string[], available: true };
  const candidates = platform === "win32"
    ? [{ command: "py", prefix: ["-3"] }, { command: "python", prefix: [] }]
    : [{ command: "python3", prefix: [] }, { command: "python", prefix: [] }];
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.prefix, "--version"], { windowsHide: true, timeout: 2_500 });
    if (!result.error) return { ...candidate, available: true };
  }
  return { ...candidates[0], available: false };
}
