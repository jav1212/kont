import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  outputDir: "out/browser",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3107",
    channel: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "corepack pnpm start",
    url: "http://127.0.0.1:3107",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
