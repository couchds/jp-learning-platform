import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import type {} from "../../web/src/desktop.js";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronExecutable = createRequire(import.meta.url)("electron") as string;
const testCapture = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const editorCapture = `data:image/svg+xml;base64,${Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <rect width="1280" height="720" fill="#142f40"/>
    <rect x="72" y="70" width="1136" height="580" rx="18" fill="#eef4ef"/>
    <rect x="108" y="108" width="430" height="504" rx="12" fill="#226b78"/>
    <circle cx="323" cy="286" r="116" fill="#ffc857"/>
    <text x="323" y="310" text-anchor="middle" font-size="74" font-family="sans-serif" fill="#073042">&#x65E5;</text>
    <text x="592" y="190" font-size="30" font-family="sans-serif" fill="#58717a">CHAPTER 04</text>
    <text x="592" y="274" font-size="50" font-family="sans-serif" font-weight="700" fill="#073042">&#x65B0;&#x3057;&#x3044;&#x4E16;&#x754C;&#x3078;</text>
    <text x="592" y="348" font-size="34" font-family="sans-serif" fill="#073042">&#x4ECA;&#x65E5;&#x306F;&#x4E00;&#x7DD2;&#x306B;&#x884C;&#x3053;&#x3046;&#x3002;</text>
    <rect x="592" y="420" width="482" height="88" rx="8" fill="#ffffff" stroke="#b8e4e2" stroke-width="3"/>
    <text x="626" y="476" font-size="30" font-family="sans-serif" fill="#073042">&#x5192;&#x967A;&#x3092;&#x59CB;&#x3081;&#x308B;</text>
  </svg>
`).toString("base64")}`;

let app: ElectronApplication;
let page: Page;
let userDataDir: string;
let ocrServer: Server;
let ocrServiceUrl: string;

test.beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "yomunami-e2e-"));
  ocrServer = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/health") {
      response.end(JSON.stringify({ status: "ok", service: "ocr", local_only: true }));
      return;
    }
    if (request.method === "POST" && request.url === "/ocr") {
      request.resume();
      request.once("end", () => response.end(JSON.stringify({
        success: true,
        raw_text: "日本語",
        elements: [],
        backend: "test",
        active_backend: "test",
        boxes_available: false,
        image_width: 1,
        image_height: 1
      })));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "Not found" }));
  });
  await new Promise<void>((resolve, reject) => {
    ocrServer.once("error", reject);
    ocrServer.listen(0, "127.0.0.1", resolve);
  });
  const ocrAddress = ocrServer.address();
  if (!ocrAddress || typeof ocrAddress === "string") throw new Error("Could not start the test OCR server");
  ocrServiceUrl = `http://127.0.0.1:${ocrAddress.port}`;
  app = await electron.launch({
    args: [desktopDir],
    cwd: desktopDir,
    env: {
      ...process.env,
      YOMUNAMI_SKIP_SERVICES: "1",
      YOMUNAMI_TEST_CAPTURE_DATA_URL: testCapture,
      YOMUNAMI_USER_DATA_DIR: userDataDir,
      OCR_SERVICE_URL: ocrServiceUrl,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
    }
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterEach(async () => {
  await app?.close();
  await new Promise<void>((resolve, reject) => {
    ocrServer.close((error) => error ? reject(error) : resolve());
  });
  await fs.rm(userDataDir, { recursive: true, force: true });
});

test("boots the embedded backend through the isolated preload bridge", async () => {
  const runtime = await page.evaluate(() => window.yomunamiDesktop?.getRuntime());
  expect(runtime).toMatchObject({ isDesktop: true, version: "0.7.0" });
  expect(runtime?.apiUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(runtime?.apiToken).toHaveLength(64);

  const health = await page.evaluate(async () => {
    const current = await window.yomunamiDesktop!.getRuntime();
    const response = await fetch(`${current.apiUrl}/health`);
    return { status: response.status, body: await response.json() };
  });
  expect(health.status).toBe(200);
  await expect.poll(() => fs.stat(path.join(userDataDir, "data", "app.sqlite")).then(() => true)).toBe(true);
});

test("exits a duplicate desktop instance before it can boot", async () => {
  const duplicate = spawn(electronExecutable, [desktopDir], {
    cwd: desktopDir,
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      YOMUNAMI_SKIP_SERVICES: "1",
      YOMUNAMI_TEST_CAPTURE_DATA_URL: testCapture,
      YOMUNAMI_USER_DATA_DIR: userDataDir,
      OCR_SERVICE_URL: ocrServiceUrl,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
    }
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      duplicate.kill();
      reject(new Error("Duplicate Yomunami instance did not exit"));
    }, 10_000);
    duplicate.once("error", reject);
    duplicate.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });

  expect(exitCode).toBe(0);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});

test("navigates packaged file routes and exposes desktop-owned controls", async () => {
  await expect(page.getByRole("navigation", { name: "Main sections" }).getByRole("link")).toHaveCount(6);
  await page.getByRole("link", { name: "Capture" }).click();
  await expect(page).toHaveURL(/#\/capture$/);
  await expect(page.getByRole("button", { name: "Capture screen" })).toBeVisible();
  await page.getByRole("button", { name: "Capture screen" }).click();
  await expect(page.getByRole("img", { name: "Screen capture preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Read full image" })).toBeVisible();
  await expect(page.getByText("Start OCR service")).toHaveCount(0);

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole("heading", { name: "Desktop app" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restart app services" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("settings.png"), fullPage: true });
});

test("routes global capture events into the in-app editor", async () => {
  await app.evaluate(({ BrowserWindow }, dataUrl) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("desktop:capture-ready", {
      ok: true,
      capture: {
        dataUrl,
        width: 1280,
        height: 720,
        displayId: "test-display",
        sourceName: "Shortcut capture"
      }
    });
  }, editorCapture);

  await expect(page).toHaveURL(/#\/capture$/);
  await expect(page.getByText("Shortcut capture")).toBeVisible();
  await expect(page.getByRole("img", { name: "Screen capture preview" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("capture-editor.png"), fullPage: true });

  const stage = page.locator(".capture-stage");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width * 0.44, bounds!.y + bounds!.height * 0.28);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.86, bounds!.y + bounds!.height * 0.58);
  await page.mouse.up();
  await expect(page.locator(".capture-selection")).toBeVisible();
  await expect(page.getByRole("button", { name: "Read selected area" })).toBeVisible();

  const browserWindow = await app.browserWindow(page);
  await browserWindow.evaluate((window) => {
    window.setMinimumSize(320, 560);
    window.setSize(390, 800);
  });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("capture-editor-narrow.png"), fullPage: true });
});

test("sends a desktop capture through the private API to OCR", async () => {
  await page.getByRole("link", { name: "Capture" }).click();
  await page.getByRole("button", { name: "Capture screen" }).click();
  await page.getByRole("button", { name: "Read full image" }).click();

  await expect(page.locator(".ocr-text")).toHaveText("日本語");
  await expect(page.getByText("Failed to fetch")).toHaveCount(0);
});

test("keeps OCR available in the background after the window is closed", async () => {
  const browserWindow = await app.browserWindow(page);
  await browserWindow.evaluate((window) => window.close());

  await expect.poll(() => browserWindow.evaluate((window) => window.isVisible())).toBe(false);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

  const result = await page.evaluate(() => window.yomunamiDesktop!.capture());
  expect(result.ok).toBe(true);
  await expect.poll(() => browserWindow.evaluate((window) => window.isVisible())).toBe(true);
});

test("keeps primary tasks usable in a narrow desktop window", async () => {
  const browserWindow = await app.browserWindow(page);
  await browserWindow.evaluate((window) => {
    window.setMinimumSize(320, 560);
    window.setSize(390, 800);
  });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole("navigation", { name: "Main sections" }).getByRole("link")).toHaveCount(6);
  await page.getByRole("link", { name: "Capture" }).click();
  await expect(page.getByRole("button", { name: "Capture screen" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("capture-narrow.png"), fullPage: true });
});
