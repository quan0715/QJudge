/**
 * Global Setup for E2E Tests
 *
 * This file runs once before all tests start.
 * It's responsible for:
 * 1. Starting Docker Compose services
 * 2. Waiting for services to be healthy
 * 3. Verifying test data is properly seeded
 */

import { execSync } from "child_process";
import * as path from "path";

async function globalSetup() {
  console.log("\n🚀 Starting E2E test environment...\n");

  const rootDir = path.resolve(__dirname, "../../../");
  const composeFile = path.join(rootDir, "docker-compose.test.yml");

  try {
    // Stop any existing containers
    console.log("📦 Stopping existing containers...");
    execSync(`docker-compose -f ${composeFile} down -v`, {
      stdio: "inherit",
      cwd: rootDir,
    });

    // Start services
    console.log("\n🐳 Starting Docker Compose services...");
    execSync(`docker-compose -f ${composeFile} up -d`, {
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
        // Check if backend is responding
        const result = execSync(
          `curl -f http://localhost:8001/api/v1/ || exit 1`,
          { encoding: "utf-8", stdio: "pipe" }
        );

        if (result) {
          console.log("✅ Backend is ready!");
          break;
        }
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          console.error("❌ Backend failed to start within timeout");
          throw new Error("Backend startup timeout");
        }
        // Wait 2 seconds before next attempt
        await new Promise((resolve) => setTimeout(resolve, 2000));
        process.stdout.write(".");
      }
    }

    // Wait for frontend to be ready
    attempts = 0;
    console.log("\n⏳ Waiting for frontend...");

    while (attempts < maxAttempts) {
      try {
        const result = execSync(`curl -f http://localhost:5174/ || exit 1`, {
          encoding: "utf-8",
          stdio: "pipe",
        });

        if (result) {
          console.log("✅ Frontend is ready!");
          break;
        }
      } catch (error) {
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
      `docker-compose -f ${composeFile} exec -T backend_test python manage.py shell << 'EOF'
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

    // Show logs for debugging
    console.log("\n📋 Backend logs:");
    try {
      execSync(`docker-compose -f ${composeFile} logs --tail=50 backend_test`, {
        stdio: "inherit",
        cwd: rootDir,
      });
    } catch (e) {
      console.error("Could not fetch backend logs");
    }

    throw error;
  }
}

export default globalSetup;
