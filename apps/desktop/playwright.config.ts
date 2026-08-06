import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 40_000,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "retain-on-failure"
  }
});
