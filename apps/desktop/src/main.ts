import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } from "electron";
import { resolveDesktopRuntimePaths } from "./runtimePaths.js";
import { captureCurrentDisplay, type DesktopCaptureResult } from "./screenCapture.js";
import { createServiceDefinitions } from "./serviceDefinitions.js";
import { ServiceSupervisor, type ManagedServiceState } from "./serviceSupervisor.js";

type RunningBackend = {
  url: string;
  close: () => Promise<void>;
};

if (process.env.YOMUNAMI_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.YOMUNAMI_USER_DATA_DIR));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.exit(0);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backend: RunningBackend | null = null;
let supervisor: ServiceSupervisor | null = null;
let shuttingDown = false;
const apiToken = randomBytes(32).toString("hex");
const runtimePaths = resolveDesktopRuntimePaths({
  appPath: app.getAppPath(),
  userDataPath: app.getPath("userData"),
  resourcesPath: process.resourcesPath,
  isPackaged: app.isPackaged
});

app.setAsDefaultProtocolClient("yomunami");
app.on("second-instance", () => showMainWindow());
app.on("open-url", (event) => {
  event.preventDefault();
  showMainWindow();
});

void app.whenReady().then(boot).catch((error) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  dialog.showErrorBox("Yomunami could not start", detail);
  app.quit();
});

app.on("activate", () => {
  if (!mainWindow) void createMainWindow();
  else showMainWindow();
});

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  void shutdown().finally(() => app.quit());
});

async function boot() {
  await Promise.all([
    fs.mkdir(runtimePaths.dataRoot, { recursive: true }),
    fs.mkdir(runtimePaths.importDir, { recursive: true }),
    fs.mkdir(runtimePaths.uploadDir, { recursive: true }),
    fs.mkdir(runtimePaths.backupDir, { recursive: true }),
    fs.mkdir(runtimePaths.logDir, { recursive: true })
  ]);
  configureBackendEnvironment();
  const { startApiServer } = await import("../../api/src/server.js");
  backend = await startApiServer({ host: "127.0.0.1", port: 0 });
  supervisor = new ServiceSupervisor(
    createServiceDefinitions({
      resourceRoot: runtimePaths.resourceRoot,
      isPackaged: app.isPackaged
    }),
    {
      onStatus: publishServiceStatus,
      onLog: (serviceId, stream, value) => void appendServiceLog(serviceId, stream, value)
    }
  );
  registerIpc();
  registerCaptureShortcut();
  createTray();
  await createMainWindow();
  if (process.env.YOMUNAMI_SKIP_SERVICES !== "1") void supervisor.startOnLaunch();
}

function configureBackendEnvironment() {
  process.env.YOMUNAMI_RESOURCE_ROOT = runtimePaths.resourceRoot;
  process.env.YOMUNAMI_DATA_ROOT = runtimePaths.dataRoot;
  process.env.DATABASE_PATH = runtimePaths.databasePath;
  process.env.IMPORT_DIR = runtimePaths.importDir;
  process.env.UPLOAD_DIR = runtimePaths.uploadDir;
  process.env.BACKUP_DIR = runtimePaths.backupDir;
  process.env.API_HOST = "127.0.0.1";
  process.env.API_PORT = "0";
  process.env.API_ALLOWED_ORIGINS = [
    "null",
    "http://127.0.0.1:5173",
    "http://localhost:5173"
  ].join(",");
  process.env.API_REQUEST_LOGGING = "false";
  process.env.YOMUNAMI_DESKTOP_AUTH_TOKEN = apiToken;
}

async function createMainWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: "#f4f7f5",
    title: "Yomunami",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow = window;
  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    window.hide();
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedNavigation(url)) event.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await window.loadFile(path.join(__dirname, "../renderer/index.html"));
}

function registerIpc() {
  ipcMain.handle("desktop:get-runtime", requireTrustedSender(() => ({
    apiUrl: backend?.url ?? "",
    apiToken,
    version: app.getVersion(),
    platform: process.platform,
    isDesktop: true as const
  })));
  ipcMain.handle("desktop:get-services", requireTrustedSender(() => supervisor?.statuses() ?? []));
  ipcMain.handle("desktop:restart-services", requireTrustedSender(async () => supervisor?.restartAll() ?? []));
  ipcMain.handle("desktop:capture", requireTrustedSender(() => requestCapture()));
  ipcMain.handle("desktop:open-data-folder", requireTrustedSender(async () => {
    await shell.openPath(runtimePaths.dataRoot);
  }));
}

function requireTrustedSender<T extends unknown[], R>(handler: (...args: T) => R) {
  return (event: Electron.IpcMainInvokeEvent, ...args: T) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error("Untrusted desktop request");
    return handler(...args);
  };
}

function registerCaptureShortcut() {
  const registered = globalShortcut.register("CommandOrControl+Shift+O", () => void captureFromShortcut());
  if (!registered) void appendServiceLog("desktop", "stderr", "Could not register Ctrl/Cmd+Shift+O\n");
}

function createTray() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "app-icon.png")
    : path.join(app.getAppPath(), "resources", "icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    void appendServiceLog("desktop", "stderr", `Could not load tray icon from ${iconPath}\n`);
    return;
  }

  tray = new Tray(icon.resize({ width: 20, height: 20 }));
  tray.setToolTip("Yomunami");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Yomunami", click: showMainWindow },
    { label: "Capture screen", click: () => void captureFromShortcut() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() }
  ]));
  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);
}

async function captureFromShortcut() {
  const result = await requestCapture();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:capture-ready", result);
  }
}

async function requestCapture(): Promise<DesktopCaptureResult> {
  mainWindow?.hide();
  await new Promise((resolve) => setTimeout(resolve, process.env.YOMUNAMI_TEST_CAPTURE_DATA_URL ? 0 : 180));
  const result = await captureCurrentDisplay();
  showMainWindow();
  return result;
}

function publishServiceStatus(states: ManagedServiceState[]) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("desktop:services-changed", states);
}

async function appendServiceLog(serviceId: string, stream: "stdout" | "stderr", value: string) {
  const line = `[${new Date().toISOString()}] [${stream}] ${value}`;
  await fs.appendFile(path.join(runtimePaths.logDir, `${serviceId}.log`), line).catch(() => undefined);
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function isTrustedNavigation(url: string) {
  if (process.env.ELECTRON_RENDERER_URL) return url.startsWith(process.env.ELECTRON_RENDERER_URL);
  return url.startsWith("file://");
}

async function shutdown() {
  globalShortcut.unregisterAll();
  tray?.destroy();
  tray = null;
  await supervisor?.stopAll();
  await backend?.close();
}
