export type DesktopServiceStatus = "stopped" | "starting" | "running" | "unavailable" | "failed";

export type DesktopService = {
  id: string;
  label: string;
  status: DesktopServiceStatus;
  detail: string;
  pid?: number;
  managed: boolean;
};

export type DesktopRuntime = {
  apiUrl: string;
  apiToken: string;
  version: string;
  platform: "aix" | "android" | "darwin" | "freebsd" | "haiku" | "linux" | "openbsd" | "sunos" | "win32" | "cygwin" | "netbsd";
  isDesktop: true;
};

export type DesktopCapture = {
  dataUrl: string;
  width: number;
  height: number;
  displayId: string;
  sourceName: string;
};

export type DesktopCaptureResult = {
  ok: boolean;
  capture?: DesktopCapture;
  error?: string;
};

export type KakomuDesktopBridge = {
  getRuntime(): Promise<DesktopRuntime>;
  getServices(): Promise<DesktopService[]>;
  restartServices(): Promise<DesktopService[]>;
  capture(): Promise<DesktopCaptureResult>;
  openDataFolder(): Promise<void>;
  onServicesChanged(listener: (states: DesktopService[]) => void): () => void;
  onCaptureReady(listener: (result: DesktopCaptureResult) => void): () => void;
};

declare global {
  interface Window {
    kakomuDesktop?: KakomuDesktopBridge;
    yomunamiDesktop?: KakomuDesktopBridge;
  }
}

export type YomunamiDesktopBridge = KakomuDesktopBridge;

let runtimePromise: Promise<DesktopRuntime | null> | undefined;

export function getDesktopBridge() {
  return window.kakomuDesktop ?? window.yomunamiDesktop ?? null;
}

export function getDesktopRuntime() {
  runtimePromise ??= getDesktopBridge()?.getRuntime() ?? Promise.resolve(null);
  return runtimePromise;
}

export function isDesktopApp() {
  return Boolean(getDesktopBridge());
}
