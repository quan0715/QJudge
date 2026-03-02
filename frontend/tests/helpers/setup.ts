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

function getHealthUrls(
  envName: string,
  defaults: string[]
): string[] {
  const envValue = process.env[envName];
  if (!envValue) return defaults;
  return envValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getBackendHealthUrls(): string[] {
  return getHealthUrls("E2E_BACKEND_HEALTH_URLS", [
    "http://localhost:8001/api/v1/auth/me",
    "http://backend-test:8000/api/v1/auth/me",
  ]);
}

function getFrontendHealthUrls(): string[] {
  return getHealthUrls("E2E_FRONTEND_HEALTH_URLS", [
    "http://localhost:5174/",
    "http://frontend-test:5174/",
  ]);
}

async function getUrlStatus(url: string, timeoutMs = 2000): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    return response.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getFirstReachableStatus(urls: string[]): Promise<number | null> {
  for (const url of urls) {
    const statusCode = await getUrlStatus(url);
    if (statusCode !== null && statusCode > 0) {
      return statusCode;
    }
  }
  return null;
}

function canQueryDocker(composeFile: string, rootDir: string): boolean {
  try {
    execSync(`docker compose -f ${composeFile} ps --services`, {
      encoding: "utf-8",
      stdio: "pipe",
      cwd: rootDir,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the E2E environment is already running
 */
function isServiceRunning(
  composeFile: string,
  rootDir: string,
  service: string
): boolean {
  try {
    const output = execSync(
      `docker compose -f ${composeFile} ps --services --status running ${service}`,
      { encoding: "utf-8", stdio: "pipe", cwd: rootDir }
    )
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return output.includes(service);
  } catch {
    return false;
  }
}

async function isEnvironmentRunning(
  composeFile: string,
  rootDir: string
): Promise<boolean> {
  try {
    if (canQueryDocker(composeFile, rootDir)) {
      // Prevent false positives when another service occupies exposed ports.
      if (!isServiceRunning(composeFile, rootDir, "backend-test")) return false;
      if (!isServiceRunning(composeFile, rootDir, "frontend-test")) return false;
    }

    const backendStatus = await getFirstReachableStatus(getBackendHealthUrls());
    const frontendStatus = await getFirstReachableStatus(getFrontendHealthUrls());
    return (
      backendStatus !== null &&
      backendStatus !== 404 &&
      backendStatus < 500 &&
      frontendStatus === 200
    );
  } catch {
    return false;
  }
}

/**
 * Check if backend is responding
 */
async function isBackendRunning(
  composeFile: string,
  rootDir: string
): Promise<boolean> {
  try {
    if (canQueryDocker(composeFile, rootDir)) {
      if (!isServiceRunning(composeFile, rootDir, "backend-test")) return false;
    }
    const statusCode = await getFirstReachableStatus(getBackendHealthUrls());
    return statusCode !== null && statusCode !== 404 && statusCode < 500;
  } catch {
    return false;
  }
}

/**
 * Warm up the Vite dev server by fetching key pages.
 * Vite compiles modules on-demand; the first request triggers bundling of
 * the entire dependency tree. On CI VMs this can take 15-30s, causing the
 * first real test to timeout waiting for React to render.
 */
async function warmupFrontend() {
  const urls = getFrontendHealthUrls();
  const warmupPaths = ["/login", "/problems"];

  console.log("🔥 Warming up frontend (Vite on-demand compile)...");

  for (const base of urls) {
    const origin = base.replace(/\/$/, "");
    for (const p of warmupPaths) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);
        await fetch(`${origin}${p}`, { signal: controller.signal });
        clearTimeout(timer);
      } catch {
        // ignore — just triggering Vite compilation
      }
    }
    // If the first base URL responded, no need to try alternatives
    const status = await getUrlStatus(base);
    if (status === 200) break;
  }

  console.log("✅ Frontend warmed up!");
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
        if (await isBackendRunning(composeFile, rootDir)) {
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
          const frontendStatus = await getFirstReachableStatus(
            getFrontendHealthUrls()
          );
          if (frontendStatus === 200) {
            console.log("✅ Frontend is ready!");
            break;
          }
          throw new Error(`Unexpected frontend status: ${frontendStatus}`);
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

      // Warm up Vite dev server: first page load triggers on-demand bundling
      await warmupFrontend();

      console.log("\n✨ E2E environment is ready!\n");
      return;
    }

    // Local development: check if environment is already running
    if (await isEnvironmentRunning(composeFile, rootDir)) {
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

      await warmupFrontend();

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
        const statusCode = await getFirstReachableStatus(getBackendHealthUrls());

        if (statusCode !== null && statusCode >= 200 && statusCode < 500) {
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
        const frontendStatus = await getFirstReachableStatus(
          getFrontendHealthUrls()
        );
        if (frontendStatus === 200) {
          console.log("✅ Frontend is ready!");
          break;
        }
        throw new Error(`Unexpected frontend status: ${frontendStatus}`);
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

    await warmupFrontend();

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
