import { defineConfig } from "@playwright/test";

// Database-free interaction tests: real Carbon/Motion, synthetic paper only.
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "workbench-rail.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4178",
    channel: process.env.CI ? undefined : "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1366, height: 768 } } },
    {
      name: "tablet",
      use: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4178 --strictPort",
    url: "http://127.0.0.1:4178/tests/browser/fixtures/workbench-rail.html",
    reuseExistingServer: !process.env.CI,
  },
});
