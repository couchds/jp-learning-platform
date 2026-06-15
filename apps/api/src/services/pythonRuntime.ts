import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export type PythonRuntime = {
  command: string;
  argsPrefix: string[];
  label: "venv" | "system";
  detail: string;
  available: boolean;
};

export function virtualEnvPythonPath(serviceRoot: string): string {
  return process.platform === "win32"
    ? path.join(serviceRoot, ".venv", "Scripts", "python.exe")
    : path.join(serviceRoot, ".venv", "bin", "python");
}

export function resolvePythonRuntime(venvPythonPath: string): PythonRuntime {
  if (fs.existsSync(venvPythonPath)) {
    return {
      command: venvPythonPath,
      argsPrefix: [],
      label: "venv",
      detail: venvPythonPath,
      available: true
    };
  }

  for (const candidate of systemPythonCandidates()) {
    const available = commandIsAvailable(candidate);
    if (available) {
      return available;
    }
  }

  const [fallback] = systemPythonCandidates();
  return { ...fallback, available: false };
}

export function venvSetupHint(servicePath: string): string {
  if (process.platform === "win32") {
    return `Run: cd ${servicePath} && py -3 -m venv .venv && .venv\\Scripts\\python -m pip install -r requirements.txt`;
  }

  return `Run: cd ${servicePath} && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`;
}

function systemPythonCandidates(): PythonRuntime[] {
  if (process.platform === "win32") {
    return [
      {
        command: "py",
        argsPrefix: ["-3"],
        label: "system",
        detail: "py -3",
        available: false
      },
      {
        command: "python",
        argsPrefix: [],
        label: "system",
        detail: "python",
        available: false
      }
    ];
  }

  return [
    {
      command: "python3",
      argsPrefix: [],
      label: "system",
      detail: "python3",
      available: false
    },
    {
      command: "python",
      argsPrefix: [],
      label: "system",
      detail: "python",
      available: false
    }
  ];
}

function commandIsAvailable(candidate: PythonRuntime): PythonRuntime | null {
  const result = spawnSync(candidate.command, [...candidate.argsPrefix, "--version"], {
    encoding: "utf8",
    timeout: 2500,
    windowsHide: true
  });

  return result.error ? null : { ...candidate, available: true };
}
