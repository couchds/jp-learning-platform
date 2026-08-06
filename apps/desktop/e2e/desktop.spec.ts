import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import type {} from "../../web/src/desktop.js";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let app: ElectronApplication;
let page: Page;
let userDataDir: string;

test.beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "yomunami-e2e-"));
  app = await electron.launch({
    args: [desktopDir],
    cwd: desktopDir,
    env: {
      ...process.env,
      YOMUNAMI_SKIP_SERVICES: "1",
      YOMUNAMI_USER_DATA_DIR: userDataDir,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
    }
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterEach(async () => {
  await app.close();
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

test("navigates packaged file routes and exposes desktop-owned controls", async () => {
  await expect(page.getByRole("navigation", { name: "Main sections" }).getByRole("link")).toHaveCount(6);
  await page.getByRole("link", { name: "Capture" }).click();
  await expect(page).toHaveURL(/#\/capture$/);
  await expect(page.getByRole("button", { name: "Capture screen" })).toBeVisible();
  await expect(page.getByText("Start OCR service")).toHaveCount(0);

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole("heading", { name: "Desktop app" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restart app services" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("settings.png"), fullPage: true });
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
