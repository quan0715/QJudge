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
 */
export const TEST_CONTESTS = {
  active: {
    name: "E2E Test Contest",
    description: "這是一個用於 E2E 測試的競賽",
  },
  upcoming: {
    name: "Upcoming Contest",
    description: "即將開始的競賽",
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
  },
} as const;
