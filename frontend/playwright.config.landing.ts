import { defineConfig } from "@playwright/test";

// Public landing-page regression coverage; no backend or sign-in is required.
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "landing-navigation.spec.ts",
  outputDir: "./test-results/landing",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4181",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "small-mobile", use: { viewport: { width: 320, height: 720 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4181 --strictPort",
    url: "http://127.0.0.1:4181/landing.html",
    reuseExistingServer: !process.env.CI,
  },
});
