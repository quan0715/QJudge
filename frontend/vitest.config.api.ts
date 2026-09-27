import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest config for API Integration Tests
 *
 * 這些測試打真實的後端：先以 `ci/e2e-stack.sh` 安裝 stack，
 * 預設目標 http://localhost:8080（可用 API_BASE_URL 覆寫）。
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node", // Use Node environment for API tests
    include: ["src/infrastructure/api/__tests__/integration/**/*.integration.test.ts"],
    testTimeout: 30000, // API tests may take longer
    hookTimeout: 30000,
    // Run serially: integration suites mutate global fetch/localStorage.
    pool: "forks",
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
  },
  resolve: {
    alias: [
      { find: "@/tests", replacement: path.resolve(__dirname, "./tests") },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
});
