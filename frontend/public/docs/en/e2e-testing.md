# E2E Testing Guide

This document explains how to set up and run frontend E2E tests.

## Overview

This project uses Playwright for end-to-end (E2E) testing, with Docker Compose providing the complete test environment, including:

- Dedicated test database (PostgreSQL)
- Test Redis instance
- Django backend test service
- Celery Worker (for submission processing)
- React frontend test service
- Pre-seeded test data

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Playwright Tests                      │
│              (Chrome + Safari dual browsers)            │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Docker Compose Test Environment            │
│              (docker-compose.test.yml)                  │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ frontend-test│  │ backend-test │  │ celery-test  │  │
│  │   :5174      │◄─┤   :8001      │◄─┤   Worker     │  │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘  │
│                           │                  │          │
│                   ┌───────▼────────┐ ┌──────▼───────┐  │
│                   │ postgres-test  │ │  redis-test  │  │
│                   │ (test_oj_e2e)  │ │   :6380      │  │
│                   └────────────────┘ └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Test Data

The test environment automatically seeds the following test data:

### Test Users

| Role     | Email                | Password   | Purpose           |
| -------- | -------------------- | ---------- | ----------------- |
| Admin    | admin@example.com    | admin123   | Admin testing     |
| Teacher  | teacher@example.com  | teacher123 | Teacher features  |
| Student  | student@example.com  | student123 | Student features  |
| Student2 | student2@example.com | student123 | Multi-user testing|

### Test Problems

- **P001: A+B Problem** (Easy) - Calculate the sum of two integers, includes 3 test cases
- **P002: Hello World** (Easy) - Output "Hello, World!", includes 1 test case
- **P003: Factorial** (Medium) - Calculate factorial, includes 3 test cases

### Test Contests

- **E2E Test Contest** (Active) - Contains A+B Problem and Hello World, can join and submit
- **Upcoming Contest** (Not started) - Contains Factorial, cannot join yet

## Quick Start

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Install Playwright Browsers

```bash
# Install Chrome and Safari
npx playwright install chromium webkit
```

### 3. Start Test Environment

```bash
# Start test environment using Docker Compose
docker compose -f docker-compose.test.yml up -d

# Wait for services to be ready (about 30-60 seconds)
# Check service status with:
docker compose -f docker-compose.test.yml ps
```

### 4. Run Tests

```bash
cd frontend

# Run all E2E tests (auto-detects if environment is running)
npm run test:e2e

# Test Chrome only
npx playwright test -c playwright.config.e2e.ts --project=chromium

# Test Safari only
npx playwright test -c playwright.config.e2e.ts --project=webkit

# Run specific test file
npx playwright test -c playwright.config.e2e.ts tests/e2e/auth.e2e.spec.ts

# Run specific test case
npx playwright test -c playwright.config.e2e.ts --grep "should login"

# Use UI mode (recommended for debugging)
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug

# View test report
npx playwright show-report playwright-report-e2e
```

### 5. Stop Test Environment

```bash
# Stop and cleanup test environment
docker compose -f docker-compose.test.yml down -v
```

## Test Environment Features

### Smart Environment Detection

The test framework automatically detects environment status:
- If environment is running, runs tests immediately (fast)
- If environment is not running, automatically starts Docker environment (local development)
- In CI environment, waits for pre-started services to be ready

### Environment Preservation

By default, the Docker environment is preserved after tests complete for:
- Quick test re-runs
- Manual debugging

To cleanup the environment:
```bash
# Cleanup after tests
E2E_CLEANUP=true npm run test:e2e

# Or manually stop
docker compose -f docker-compose.test.yml down -v
```

## Test Structure

```
frontend/
├── tests/
│   ├── e2e/                      # E2E test files
│   │   ├── auth.e2e.spec.ts      # Auth tests (17 test cases)
│   │   ├── problems.e2e.spec.ts  # Problem list tests (8 test cases)
│   │   ├── submission.e2e.spec.ts# Submission tests (10 test cases)
│   │   └── contest.e2e.spec.ts   # Contest tests
│   └── helpers/                  # Test utilities
│       ├── auth.helper.ts        # Auth helper functions
│       ├── data.helper.ts        # Test data constants
│       ├── setup.ts              # Global setup (environment detection)
│       └── teardown.ts           # Global teardown (environment preservation)
├── playwright.config.e2e.ts      # Playwright E2E config
└── playwright-report-e2e/        # Test report output directory
```

## Test Coverage

### Auth Tests (auth.e2e.spec.ts) - 17 tests

#### Registration
- ✅ Register new user successfully
- ✅ Show error when passwords don't match
- ✅ Show error when email already exists

#### Login
- ✅ Student login successfully
- ✅ Teacher login successfully
- ✅ Admin login successfully
- ✅ Show error with invalid credentials
- ✅ Show error with wrong password
- ✅ Handle empty fields

#### Logout
- ✅ Logout successfully and redirect to login page

#### Session Management
- ✅ Redirect unauthorized access to dashboard
- ✅ Maintain session after page reload
- ✅ Store token in localStorage after login
- ✅ Clear token after logout

#### Navigation
- ✅ Navigate from login to register page
- ✅ Navigate from register to login page
- ✅ Redirect to login when accessing protected route without auth

### Problem List Tests (problems.e2e.spec.ts) - 8 tests

- ✅ Display problem list page
- ✅ Display A+B Problem
- ✅ Display Hello World Problem
- ✅ Display difficulty badges
- ✅ Navigate to problem detail when clicking
- ✅ Access problems page from navigation menu
- ✅ Display problems in table format
- ✅ Show problem time and memory limits

### Submission Tests (submission.e2e.spec.ts) - 10 tests

- ✅ Display problem detail page
- ✅ Display problem description and test cases
- ✅ Display coding tab
- ✅ Submit code and see result
- ✅ View submission history
- ✅ Filter submissions
- ✅ Display submission status
- ✅ Navigate to problem from submissions page
- ✅ Show submission detail when clicking
- ✅ Navigate to problem and see coding interface

### Contest Tests (contest.e2e.spec.ts)

- Display contest list
- Contest detail page
- Join contest
- Contest problem list

## CI/CD Integration

### GitHub Actions Configuration

Tests automatically trigger on:
- Push to `main` / `develop` branches
- Changes to `frontend/tests/e2e/**`, `frontend/src/services/**`, etc.

### Test Flow

CI test flow:
1. Start PostgreSQL and Redis
2. Start Backend and wait for health check
3. Run API integration tests
4. Start Frontend
5. Run E2E tests sequentially (Auth → Problems → Submission → Contest)
6. Upload test reports

### Test Report Artifacts

| Artifact Name | Content | Retention |
|--------------|---------|-----------|
| `playwright-report-e2e` | HTML test report | 30 days |
| `playwright-test-results` | Screenshots, Videos, Traces | 14 days (failures only) |

### Manual Trigger

You can manually trigger tests from the GitHub Actions page, selecting test type:
- `api-only` - Run API integration tests only
- `e2e-only` - Run E2E tests only
- `all` - Run all tests

## Writing New Tests

Create new test files in `frontend/tests/e2e/`:

```typescript
import { test, expect } from "@playwright/test";
import { login, clearAuth } from "../helpers/auth.helper";
import { TEST_USERS } from "../helpers/data.helper";

test.describe("My Feature Tests", () => {
  // Use serial mode to avoid login conflicts
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    // Clear previous auth state
    await page.goto("/login");
    await clearAuth(page);
    // Login
    await login(page, "student");
  });

  test("should do something", async ({ page }) => {
    // Your test logic
  });
});
```

### Using Helper Functions

```typescript
import { login, logout, clearAuth, isAuthenticated } from "../helpers/auth.helper";
import { TEST_USERS, TEST_PROBLEMS, TEST_CONTESTS } from "../helpers/data.helper";

// Login as different roles
await login(page, "student");
await login(page, "teacher");
await login(page, "admin");

// Logout
await logout(page);

// Use test data
const user = TEST_USERS.student;  // { email, password, username, role }
const problem = TEST_PROBLEMS.aPlusB;  // { title, displayId, difficulty, slug }
```

## Debugging Tests

```bash
# UI mode (recommended) - Visual test execution
npm run test:e2e:ui

# Debug mode - Step through execution
npm run test:e2e:debug

# Show browser window
npx playwright test -c playwright.config.e2e.ts --headed

# View failed test trace
npx playwright show-trace test-results/xxx/trace.zip
```

## Troubleshooting

### Test Environment Fails to Start

1. Confirm Docker is running
2. Confirm ports 5174 and 8001 are not in use
3. Check service logs:
   ```bash
   docker compose -f docker-compose.test.yml logs backend-test
   ```

### Test Data is Incorrect

Reset test environment:
```bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml up -d
```

### Login Test Fails

Ensure correct selector is used. User Menu button has aria-label "使用者選單" or "User Menu".

### API Request Fails (400 error)

Confirm Docker service names use hyphens (`-`) not underscores (`_`), e.g., `backend-test` not `backend_test`.

### Multiple Test Suites Fail When Run Together

This may be due to rate limiting or session conflicts. Recommendations:
- Use `serial` mode
- Call `clearAuth()` in `beforeEach`
- Run test suites individually

## Best Practices

1. **Data Isolation**: Use unique timestamps for test users to avoid data conflicts
2. **Wait Strategy**: Use Playwright's auto-waiting, avoid `waitForTimeout`
3. **Selector Priority**:
   - Prefer `getByRole`, `getByText`
   - Then use `data-testid`
   - Avoid unstable CSS classes
4. **Test Independence**: Clear state in `beforeEach`
5. **Error Handling**: Use `force: true` for covered elements
6. **Serial Mode**: Use `test.describe.configure({ mode: "serial" })` to avoid parallel conflicts

## References

- [Playwright Documentation](https://playwright.dev/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
