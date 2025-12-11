import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Testing Configuration
 *
 * This configuration is specifically designed for E2E testing with Docker Compose.
 * It launches the entire stack (backend, frontend, database) and runs tests against it.
 *
 * Usage:
 *   npm run test:e2e       # Run all E2E tests
 *   npm run test:e2e:ui    # Run with UI mode
 *   npm run test:e2e:debug # Run with debug mode
 */
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

  /* Run tests in parallel with multiple workers */
  /* Each test file runs independently, data conflicts avoided by:
   * - Unique timestamps for new user registrations
   * - Idempotent operations (join contest if not joined)
   * - Read-only tests for problems listing
   */
  workers: process.env.CI ? 4 : 2,

  /* Reporter to use */
  reporter: [["html", { outputFolder: "playwright-report-e2e" }], ["list"]],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL for E2E tests - points to frontend_test service */
    baseURL: "http://localhost:5174",

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

  /* Global setup and teardown */
  globalSetup: "./tests/helpers/setup.ts",
  globalTeardown: "./tests/helpers/teardown.ts",

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Clear storage before each test to ensure clean state
        storageState: undefined,
      },
    },

    // Uncomment to test on other browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Web Server Configuration */
  /* Note: We manage Docker Compose in globalSetup/globalTeardown instead */
  // webServer: {
  //   command: 'docker-compose -f ../docker-compose.test.yml up',
  //   url: 'http://localhost:5174',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
});
