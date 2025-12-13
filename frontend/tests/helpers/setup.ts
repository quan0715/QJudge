/**
 * Global Setup for E2E Tests
 *
 * This file runs once before all tests start.
 * It's responsible for:
 * 1. Checking if Docker environment is already running
 * 2. Starting Docker Compose services if needed (local only)
 * 3. Waiting for services to be healthy
 * 4. Verifying test data is properly seeded
 */

import { execSync } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Check if the E2E environment is already running
 */
function isEnvironmentRunning(): boolean {
  try {
    // Check if backend is responding
    const result = execSync(
      `curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/api/v1/auth/me`,
      { encoding: "utf-8", stdio: "pipe" }
    );
    const statusCode = parseInt(result.trim(), 10);

    // Also check frontend
    const frontendResult = execSync(
      `curl -s -o /dev/null -w "%{http_code}" http://localhost:5174/`,
      { encoding: "utf-8", stdio: "pipe" }
    );
    const frontendStatus = parseInt(frontendResult.trim(), 10);

    return statusCode >= 200 && statusCode < 500 && frontendStatus === 200;
  } catch {
    return false;
  }
}

/**
 * Check if backend is responding
 */
function isBackendRunning(): boolean {
  try {
    const result = execSync(
      `curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/api/v1/auth/me`,
      { encoding: "utf-8", stdio: "pipe" }
    );
    const statusCode = parseInt(result.trim(), 10);
    return statusCode >= 200 && statusCode < 500;
  } catch {
    return false;
  }
}

async function globalSetup() {
  console.log("\n🚀 Starting E2E test environment...\n");

  const rootDir = path.resolve(__dirname, "../../../");
  const composeFile = path.join(rootDir, "docker-compose.test.yml");
  const isCI = process.env.CI === "true";
  const reuseEnv = process.env.E2E_REUSE_ENV === "true";

  try {
    // In CI with E2E_REUSE_ENV, just wait for services (they're started by workflow)
    if (isCI && reuseEnv) {
      console.log("🔄 CI mode: Waiting for pre-started environment...\n");

      // Wait for backend to be ready
      const maxAttempts = 30;
      let attempts = 0;

      while (attempts < maxAttempts) {
        if (isBackendRunning()) {
          console.log("✅ Backend is ready!");
          break;
        }
        attempts++;
        if (attempts >= maxAttempts) {
          console.error("❌ Backend not available after waiting");
          throw new Error("Backend not available in CI");
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        process.stdout.write(".");
      }

      // Wait for frontend
      attempts = 0;
      console.log("\n⏳ Checking frontend...");

      while (attempts < maxAttempts) {
        try {
          execSync(`curl -sf http://localhost:5174/ -o /dev/null`, {
            encoding: "utf-8",
            stdio: "pipe",
          });
          console.log("✅ Frontend is ready!");
          break;
        } catch {
          attempts++;
          if (attempts >= maxAttempts) {
            console.error("❌ Frontend not available after waiting");
            throw new Error("Frontend not available in CI");
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
          process.stdout.write(".");
        }
      }

      console.log("\n✨ E2E environment is ready!\n");
      return;
    }

    // Local development: check if environment is already running
    if (isEnvironmentRunning()) {
      console.log("✅ Environment is already running! Skipping setup.\n");

      // Verify test data exists
      console.log("✅ Verifying test data...");
      try {
        execSync(
          `docker compose -f ${composeFile} exec -T backend-test python manage.py shell << 'EOF'
from django.contrib.auth import get_user_model
from apps.problems.models import Problem

User = get_user_model()
users = User.objects.count()
problems = Problem.objects.count()

print(f"Users: {users}, Problems: {problems}")

if users < 3 or problems < 2:
    print("Warning: Test data may not be properly seeded")
    exit(1)
EOF`,
          { stdio: "inherit", cwd: rootDir }
        );
      } catch {
        console.log(
          "⚠️  Could not verify test data, but environment is running."
        );
      }

      console.log("\n✨ E2E environment is ready!\n");
      return;
    }

    // Environment not running, start it (local only)
    console.log("📦 Environment not running. Starting Docker Compose...");

    // Stop any existing containers first
    execSync(`docker compose -f ${composeFile} down -v 2>/dev/null || true`, {
      stdio: "inherit",
      cwd: rootDir,
    });

    // Start services
    console.log("\n🐳 Starting Docker Compose services...");
    execSync(`docker compose -f ${composeFile} up -d`, {
      stdio: "inherit",
      cwd: rootDir,
    });

    // Wait for services to be healthy
    console.log("\n⏳ Waiting for services to be healthy...");

    // Wait for backend to be ready (max 2 minutes)
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const result = execSync(
          `curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/api/v1/auth/me`,
          { encoding: "utf-8", stdio: "pipe" }
        );
        const statusCode = parseInt(result.trim(), 10);

        if (statusCode >= 200 && statusCode < 500) {
          console.log(`✅ Backend is ready! (HTTP ${statusCode})`);
          break;
        }
        throw new Error(`Unexpected status code: ${statusCode}`);
      } catch {
        attempts++;
        if (attempts >= maxAttempts) {
          console.error("❌ Backend failed to start within timeout");
          throw new Error("Backend startup timeout");
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        process.stdout.write(".");
      }
    }

    // Wait for frontend to be ready
    attempts = 0;
    console.log("\n⏳ Waiting for frontend...");

    while (attempts < maxAttempts) {
      try {
        execSync(`curl -sf http://localhost:5174/ -o /dev/null`, {
          encoding: "utf-8",
          stdio: "pipe",
        });
        console.log("✅ Frontend is ready!");
        break;
      } catch {
        attempts++;
        if (attempts >= maxAttempts) {
          console.error("❌ Frontend failed to start within timeout");
          throw new Error("Frontend startup timeout");
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        process.stdout.write(".");
      }
    }

    // Verify test data
    console.log("\n✅ Verifying test data...");
    execSync(
      `docker compose -f ${composeFile} exec -T backend-test python manage.py shell << 'EOF'
from django.contrib.auth import get_user_model
from apps.problems.models import Problem

User = get_user_model()
users = User.objects.count()
problems = Problem.objects.count()

print(f"Users: {users}, Problems: {problems}")

if users < 3 or problems < 2:
    print("Warning: Test data may not be properly seeded")
    exit(1)
EOF`,
      { stdio: "inherit", cwd: rootDir }
    );

    console.log("\n✨ E2E environment is ready!\n");
  } catch (error) {
    console.error("\n❌ Failed to setup E2E environment:", error);

    // Show logs for debugging (local only)
    if (!isCI) {
      console.log("\n📋 Backend logs:");
      try {
        execSync(
          `docker compose -f ${composeFile} logs --tail=50 backend-test`,
          {
            stdio: "inherit",
            cwd: rootDir,
          }
        );
      } catch {
        console.error("Could not fetch backend logs");
      }
    }

    throw error;
  }
}

export default globalSetup;
