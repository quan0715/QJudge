/**
 * Global Teardown for E2E Tests
 *
 * This file runs once after all tests complete.
 * By default, it keeps the Docker environment running for faster subsequent runs.
 * Set E2E_CLEANUP=true to stop and cleanup the environment.
 */

import { execSync } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function globalTeardown() {
  console.log("\n🧹 E2E test cleanup...\n");

  const rootDir = path.resolve(__dirname, "../../../");
  const composeFile = path.join(rootDir, "docker-compose.test.yml");

  // Only cleanup if explicitly requested
  const shouldCleanup = process.env.E2E_CLEANUP === "true";

  if (!shouldCleanup) {
    console.log("♻️  Keeping Docker environment running for faster re-runs.");
    console.log("   To stop: docker-compose -f docker-compose.test.yml down -v");
    console.log("   To cleanup on teardown: E2E_CLEANUP=true npm run test:e2e\n");
    return;
  }

  try {
    // Stop and remove containers, networks, and volumes
    console.log("🛑 Stopping Docker Compose services...");
    execSync(`docker-compose -f ${composeFile} down -v`, {
      stdio: "inherit",
      cwd: rootDir,
    });

    console.log("\n✅ E2E environment cleaned up successfully!\n");
  } catch (error) {
    console.error("\n⚠️  Warning: Failed to clean up E2E environment:", error);
    console.log("You may need to manually stop containers with:");
    console.log(`  docker-compose -f ${composeFile} down -v`);
  }
}

export default globalTeardown;
