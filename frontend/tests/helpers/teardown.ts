/**
 * Global Teardown for E2E Tests
 *
 * This file runs once after all tests complete.
 * It's responsible for:
 * 1. Stopping Docker Compose services
 * 2. Cleaning up volumes and containers
 */

import { execSync } from "child_process";
import * as path from "path";

async function globalTeardown() {
  console.log("\n🧹 Cleaning up E2E test environment...\n");

  const rootDir = path.resolve(__dirname, "../../../");
  const composeFile = path.join(rootDir, "docker-compose.test.yml");

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
