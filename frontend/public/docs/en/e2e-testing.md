# E2E Testing Guide

This document explains how to set up and run frontend E2E tests.

## Overview

This project uses Playwright for end-to-end (E2E) testing, with Docker Compose providing a complete test environment including:

- Isolated test database (PostgreSQL)
- Test Redis instance
- Django backend test service
- Celery Worker (for processing submissions)
- React frontend test service
- Pre-injected test data

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Playwright Tests                      │
│                   (localhost:5174)                       │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Docker Compose Test Environment             │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Frontend   │  │   Backend    │  │   Celery     │  │
│  │   :5174      │◄─┤   :8001      │◄─┤   Worker     │  │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘  │
│                           │                  │          │
│                   ┌───────▼────────┐ ┌──────▼───────┐  │
│                   │   PostgreSQL   │ │    Redis     │  │
│                   │   (test_oj_e2e)│ │   :6380      │  │
│                   └────────────────┘ └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Test Data

The test environment automatically injects the following test data:

### Test Users

| Role     | Email                | Password   | Purpose            |
| -------- | -------------------- | ---------- | ------------------ |
| Admin    | admin@example.com    | admin123   | Admin testing      |
| Teacher  | teacher@example.com  | teacher123 | Teacher features   |
| Student  | student@example.com  | student123 | Student testing    |
| Student2 | student2@example.com | student123 | Multi-user testing |

### Test Problems

- **P001: A+B Problem** (Easy) - Calculate sum of two integers, 3 test cases
- **P002: Hello World** (Easy) - Output "Hello, World!", 1 test case
- **P003: Factorial** (Medium) - Calculate factorial, 3 test cases

### Test Contests

- **E2E Test Contest** (In Progress) - Contains A+B Problem and Hello World, can join and submit
- **Upcoming Contest** (Starting Soon) - Contains Factorial, cannot join yet

## Quick Start

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Install Playwright Browsers

```bash
npx playwright install
```

### 3. Start Test Environment

Use the management script to start the complete E2E test environment:

```bash
# Method 1: Use management script (recommended)
./frontend/scripts/e2e-env.sh start

# Method 2: Use Docker Compose directly
docker-compose -f docker-compose.test.yml up -d
```

Wait for services to start (about 1-2 minutes), the script will automatically wait for services to be ready.

### 4. Run Tests

```bash
cd frontend

# Run all E2E tests
npm run test:e2e

# Run in UI mode
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug

# Run in headed browser
npm run test:e2e:headed

# View test report
npm run test:e2e:report
```

### 5. Stop Test Environment

```bash
# Use management script
./frontend/scripts/e2e-env.sh stop

# Or use Docker Compose
docker-compose -f docker-compose.test.yml down -v
```

## Management Script Usage

`frontend/scripts/e2e-env.sh` provides the following commands:

```bash
# Start environment
./frontend/scripts/e2e-env.sh start

# Stop environment
./frontend/scripts/e2e-env.sh stop

# Reset environment (recreate test data)
./frontend/scripts/e2e-env.sh reset

# Check service status
./frontend/scripts/e2e-env.sh status

# View logs
./frontend/scripts/e2e-env.sh logs                # All services
./frontend/scripts/e2e-env.sh logs backend_test   # Specific service

# Execute command in container
./frontend/scripts/e2e-env.sh exec backend_test python manage.py shell

# Show help
./frontend/scripts/e2e-env.sh help
```

## Test Structure

```
frontend/
├── tests/
│   ├── e2e/                      # E2E test files
│   │   ├── auth.e2e.spec.ts      # Authentication tests
│   │   ├── problems.e2e.spec.ts  # Problem list tests
│   │   ├── submission.e2e.spec.ts# Submission tests
│   │   └── contest.e2e.spec.ts   # Contest tests
│   └── helpers/                  # Test utilities
│       ├── auth.helper.ts        # Auth helper functions
│       ├── data.helper.ts        # Test data constants
│       ├── setup.ts              # Global setup
│       └── teardown.ts           # Global teardown
├── playwright.config.e2e.ts      # Playwright E2E config
└── scripts/
    └── e2e-env.sh                # Environment management script
```

## Test Coverage

### Authentication Tests (auth.e2e.spec.ts)

- User registration
- User login (Student, Teacher, Admin)
- User logout
- Invalid credentials error handling
- Unauthorized access protection
- Session persistence

### Problem List Tests (problems.e2e.spec.ts)

- Display problem list
- Problem info display (title, difficulty, number)
- Click problem to view details
- Pagination
- Navigation

### Submission Tests (submission.e2e.spec.ts)

- Display problem details
- Problem description and test cases
- Code editor
- Submit code
- View submission results
- Submission history
- Submission filtering

### Contest Tests (contest.e2e.spec.ts)

- Display contest list
- Contest status display
- Contest detail page
- Join contest
- Contest problem list
- Solve problems in contest
- Contest leaderboard
- Time limit checking

## Writing New Tests

Create a new test file in `frontend/tests/e2e/`:

```typescript
import { test, expect } from "@playwright/test";
import { login } from "../helpers/auth.helper";

test.describe("My Feature Tests", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "student");
  });

  test("should do something", async ({ page }) => {
    // Your test logic
  });
});
```

Using helper functions:

```typescript
import { login, logout } from "../helpers/auth.helper";
import { TEST_USERS, TEST_PROBLEMS } from "../helpers/data.helper";

// Login
await login(page, "student");

// Use test data
const user = TEST_USERS.student;
const problem = TEST_PROBLEMS.aPlusB;
```

## Debugging Tests

```bash
# UI mode (recommended)
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug

# Run specific test file
npx playwright test -c playwright.config.e2e.ts tests/e2e/auth.e2e.spec.ts

# Run specific test case
npx playwright test -c playwright.config.e2e.ts -g "should login as student"
```

## FAQ

### Test environment fails to start

Check the following:

1. Is Docker running?
2. Are ports 5174 and 8001 available?
3. Check service logs: `./frontend/scripts/e2e-env.sh logs`

### Test data is incorrect

Reset the test environment:

```bash
./frontend/scripts/e2e-env.sh reset
```

### Tests run slowly

1. Ensure Docker has sufficient resources
2. Use `--workers=1` to avoid parallel tests
3. Consider using API login instead of UI login (faster)

### How to run tests in CI/CD

```bash
# Set CI environment variable
export CI=true

# Start environment
./frontend/scripts/e2e-env.sh start

# Run tests
cd frontend && npm run test:e2e

# Cleanup
cd .. && ./frontend/scripts/e2e-env.sh stop
```

## Best Practices

1. **Data Isolation**: Reset environment before each test run to ensure test independence
2. **Wait Strategy**: Use Playwright's auto-wait, avoid `waitForTimeout`
3. **Selector Priority**:
   - Prefer `data-testid`
   - Then semantic selectors (role, text)
   - Avoid CSS classes (prone to change)
4. **Test Independence**: Each test should run independently without relying on other tests
5. **Clean State**: Clear authentication state in `beforeEach`

## Performance Optimization

1. **Use API Login**: For tests not testing the login flow, use `loginViaAPI()` for speed
2. **Reduce Wait Time**: Leverage Playwright's auto-wait mechanism
3. **Parallel Execution**: Use carefully, ensure test data doesn't conflict
4. **Snapshot Testing**: Consider visual snapshot testing for stable UI

## Maintenance

### Update Test Data

Modify `backend/apps/core/management/commands/seed_e2e_data.py` to update test data structure.

### Update Test Configuration

Modify `frontend/playwright.config.e2e.ts` to adjust test behavior (timeout, retry count, etc.).

### Update Environment Configuration

Modify `docker-compose.test.yml` to adjust service configuration (port, environment variables, etc.).

## References

- [Playwright Documentation](https://playwright.dev/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Django Testing Best Practices](https://docs.djangoproject.com/en/stable/topics/testing/)
