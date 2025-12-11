import { defineConfig } from "vitest/config";

/**
 * Vitest config for API Integration Tests
 *
 * 這些測試需要真實的後端環境運行
 * 執行前需要: docker compose -f docker-compose.test.yml up -d
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node", // Use Node environment for API tests
    include: ["src/services/__tests__/**/*.integration.test.ts"],
    testTimeout: 30000, // API tests may take longer
    hookTimeout: 30000,
    // Run serially to avoid rate limiting issues
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
