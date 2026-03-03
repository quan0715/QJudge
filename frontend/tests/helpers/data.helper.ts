/**
 * Test Data Constants
 *
 * This file contains all test data constants used in E2E tests.
 * These should match the data created by the seed_e2e_data.py management command.
 */

/**
 * Test user credentials
 */
export const TEST_USERS = {
  admin: {
    email: "admin@example.com",
    password: "admin123",
    username: "admin",
    role: "admin",
  },
  teacher: {
    email: "teacher@example.com",
    password: "teacher123",
    username: "teacher",
    role: "teacher",
  },
  student: {
    email: "student@example.com",
    password: "student123",
    username: "student",
    role: "student",
  },
  student2: {
    email: "student2@example.com",
    password: "student123",
    username: "student2",
    role: "student",
  },
} as const;

/**
 * Test problems
 */
export const TEST_PROBLEMS = {
  aPlusB: {
    title: "A+B Problem",
    displayId: "P001",
    difficulty: "easy",
    slug: "a-plus-b",
  },
  helloWorld: {
    title: "Hello World",
    displayId: "P002",
    difficulty: "easy",
    slug: "hello-world",
  },
  factorial: {
    title: "Factorial",
    displayId: "P003",
    difficulty: "medium",
    slug: "factorial",
  },
} as const;

/**
 * Test contests
 * Note: These should match the data created by seed_e2e_data.py
 */
export const TEST_CONTESTS = {
  active: {
    name: "E2E Test Contest",
    description: "這是一個用於 E2E 測試的競賽",
    // Contest settings (camelCase for frontend entity)
    scoreboardVisibleDuringContest: true,
    anonymousModeEnabled: false,
    cheatDetectionEnabled: false,
  },
  upcoming: {
    name: "Upcoming Contest",
    description: "即將開始的競賽",
    scoreboardVisibleDuringContest: false,
    anonymousModeEnabled: false,
    cheatDetectionEnabled: false,
  },
  examMode: {
    name: "E2E Exam Mode Contest",
    description: "考試模式 E2E 測試用",
    cheatDetectionEnabled: true,
    contestType: "paper_exam" as const,
    maxCheatWarnings: 2,
  },
} as const;

/**
 * Test submissions code samples
 */
export const TEST_CODE_SAMPLES = {
  aPlusBCorrect: `#include <iostream>

using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`,
  aPlusBWrong: `#include <iostream>

using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a - b << endl;  // Wrong: subtraction instead of addition
    return 0;
}`,
  helloWorldCorrect: `#include <iostream>

using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
} as const;

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  auth: {
    login: "/api/v1/auth/email/login",
    register: "/api/v1/auth/email/register",
    me: "/api/v1/auth/me",
  },
  problems: {
    list: "/api/v1/problems/",
    detail: (id: string | number) => `/api/v1/problems/${id}/`,
    statistics: (id: string | number) => `/api/v1/problems/${id}/statistics/`,
    tags: "/api/v1/problems/tags/",
    tagDetail: (slug: string) => `/api/v1/problems/tags/${slug}/`,
  },
  submissions: {
    list: "/api/v1/submissions/",
    create: "/api/v1/submissions/",
    detail: (id: string | number) => `/api/v1/submissions/${id}/`,
  },
  contests: {
    list: "/api/v1/contests/",
    detail: (id: string | number) => `/api/v1/contests/${id}/`,
    join: (id: string | number) => `/api/v1/contests/${id}/join/`,
    register: (id: string | number) => `/api/v1/contests/${id}/register/`,
    examStart: (id: string | number) => `/api/v1/contests/${id}/exam/start/`,
    examEnd: (id: string | number) => `/api/v1/contests/${id}/exam/end/`,
    examEvents: (id: string | number) => `/api/v1/contests/${id}/exam/events/`,
    examHeartbeat: (id: string | number) =>
      `/api/v1/contests/${id}/exam/heartbeat/`,
  },
} as const;
