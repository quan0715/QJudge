import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Testing Configuration
 *
 * Runs on the host against the frontend of a stack installed by
 * `ci/e2e-stack.sh` (http://localhost:8080 by default).
 *
 * Usage (stack already up):
 *   npm run test:e2e            # headless
 *   npm run test:e2e:ui         # Playwright UI
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npm run test:e2e
 */
const e2eBaseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.E2E_BASE_URL ||
  "http://localhost:8080";

export default defineConfig({
  testDir: "./tests/e2e",

  /* Maximum time one test can run for */
  timeout: 60 * 1000,

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Run tests with limited workers to avoid login conflicts */
  /* Use 1 worker locally for stability, more in CI with isolated browsers */
  workers: process.env.CI ? 2 : 1,

  /* Reporter to use */
  reporter: [["html", { outputFolder: "playwright-report-e2e" }], ["list"]],

  /* Shared settings for all the projects below */
  use: {
    baseURL: e2eBaseURL,

    /* Collect trace when retrying the failed test */
    trace: "retain-on-failure",

    /* Screenshot on failure */
    screenshot: "only-on-failure",

    /* Video on failure */
    video: "retain-on-failure",

    /* Maximum time each action can take */
    actionTimeout: 10 * 1000,

    /* Maximum time for navigation */
    navigationTimeout: 30 * 1000,
  },

  /* Wait for the running stack */
  globalSetup: "./tests/helpers/setup.ts",

  /* Configure projects for Chrome only */
  projects: [
    // Setup project
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // storageState will be overridden in individual tests using test.use()
      },
      dependencies: ['setup'],
    },
  ],
});
