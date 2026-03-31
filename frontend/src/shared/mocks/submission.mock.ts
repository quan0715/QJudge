import type {
  Submission,
  SubmissionStatus,
  SubmissionDetail,
  TestResult,
} from "@/core/entities/submission.entity";

// =====================================================
// Constants
// =====================================================
export const SUBMISSION_STATUSES: SubmissionStatus[] = [
  "AC",
  "WA",
  "TLE",
  "MLE",
  "RE",
  "CE",
  "pending",
  "judging",
];

export const LANGUAGES = ["Python", "C++", "Java", "JavaScript", "C"] as const;
export type MockLanguage = (typeof LANGUAGES)[number];

// =====================================================
// Mock Users
// =====================================================
export const mockUsers = {
  alice: { id: "user-001", name: "alice" },
  bob: { id: "user-002", name: "bob" },
  charlie: { id: "user-003", name: "charlie" },
  david: { id: "user-004", name: "david" },
  eve: { id: "user-005", name: "eve" },
};

// =====================================================
// Mock Problems (for submission context)
// =====================================================
export const mockSubmissionProblems = {
  twoSum: { id: "prob-001", title: "Two Sum" },
  addTwoNumbers: { id: "prob-002", title: "Add Two Numbers" },
  longestSubstring: { id: "prob-003", title: "Longest Substring" },
  medianArrays: { id: "prob-004", title: "Median of Two Sorted Arrays" },
  palindrome: { id: "prob-005", title: "Longest Palindromic Substring" },
};

// =====================================================
// Submission Factory
// =====================================================
interface CreateSubmissionOptions {
  id?: string;
  problemId?: string;
  problemTitle?: string;
  userId?: string;
  username?: string;
  language?: MockLanguage;
  status?: SubmissionStatus;
  score?: number;
  execTime?: number;
  memoryUsage?: number;
  createdAt?: string | Date;
  contestId?: string;
}

let submissionCounter = 0;

export function createMockSubmission(
  options: CreateSubmissionOptions = {}
): Submission {
  submissionCounter++;
  const {
    id = `sub-${String(submissionCounter).padStart(3, "0")}`,
    problemId = mockSubmissionProblems.twoSum.id,
    problemTitle = mockSubmissionProblems.twoSum.title,
    userId = mockUsers.alice.id,
    username = mockUsers.alice.name,
    language = "Python",
    status = "AC",
    score = status === "AC" ? 100 : Math.floor(Math.random() * 80),
    execTime = status === "pending" || status === "judging"
      ? undefined
      : Math.floor(Math.random() * 2000) + 10,
    memoryUsage = status === "pending" || status === "judging"
      ? undefined
      : Math.floor(Math.random() * 100000) + 1024,
    createdAt = new Date(
      Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)
    ),
    contestId,
  } = options;

  return {
    id,
    problemId,
    problemTitle,
    userId,
    username,
    language,
    status,
    score,
    execTime,
    memoryUsage,
    createdAt:
      typeof createdAt === "string" ? createdAt : createdAt.toISOString(),
    contestId,
  };
}

// =====================================================
// Test Result Factory
// =====================================================
interface CreateTestResultOptions {
  id?: string | number;
  testCaseId?: string | number;
  status?: SubmissionStatus;
  execTime?: number;
  memoryUsage?: number;
  isHidden?: boolean;
  errorMessage?: string;
  input?: string;
  output?: string;
  expectedOutput?: string;
}

export function createMockTestResult(
  options: CreateTestResultOptions = {}
): TestResult {
  const {
    id = Math.floor(Math.random() * 10000),
    testCaseId = id,
    status = "passed",
    execTime = Math.floor(Math.random() * 500) + 10,
    memoryUsage = Math.floor(Math.random() * 50000) + 1024,
    isHidden = false,
    errorMessage,
    input = "1 2 3",
    output = "6",
    expectedOutput = "6",
  } = options;

  return {
    id,
    testCaseId,
    status,
    execTime,
    memoryUsage,
    isHidden,
    errorMessage,
    input,
    output,
    expectedOutput,
  };
}

// =====================================================
// Submission Detail Factory
// =====================================================
interface CreateSubmissionDetailOptions extends CreateSubmissionOptions {
  code?: string;
  errorMessage?: string;
  testCaseCount?: number;
}

export function createMockSubmissionDetail(
  options: CreateSubmissionDetailOptions = {}
): SubmissionDetail {
  const {
    code = `def solution(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        if target - num in seen:\n            return [seen[target - num], i]\n        seen[num] = i\n    return []`,
    errorMessage,
    testCaseCount = 5,
    ...submissionOptions
  } = options;

  const submission = createMockSubmission(submissionOptions);

  // Generate test results based on status
  const results: TestResult[] = [];
  for (let i = 0; i < testCaseCount; i++) {
    const isLast = i === testCaseCount - 1;
    let testStatus: SubmissionStatus = "passed";

    if (submission.status === "AC") {
      testStatus = "passed";
    } else if (submission.status === "WA" && isLast) {
      testStatus = "failed";
    } else if (submission.status === "TLE" && isLast) {
      testStatus = "TLE";
    } else if (submission.status === "MLE" && isLast) {
      testStatus = "MLE";
    } else if (submission.status === "RE" && isLast) {
      testStatus = "RE";
    }

    results.push(
      createMockTestResult({
        id: i + 1,
        testCaseId: i + 1,
        status: testStatus,
        isHidden: i >= testCaseCount - 2,
      })
    );
  }

  return {
    ...submission,
    code,
    errorMessage,
    results,
    totalTestCases: testCaseCount,
  };
}

// =====================================================
// Pre-defined Submissions
// =====================================================
export const mockSubmissions = {
  // Accepted submissions
  accepted: createMockSubmission({
    id: "sub-ac-001",
    status: "AC",
    score: 100,
    execTime: 45,
    memoryUsage: 4096,
    username: "alice",
  }),

  acceptedFast: createMockSubmission({
    id: "sub-ac-002",
    status: "AC",
    score: 100,
    execTime: 12,
    memoryUsage: 2048,
    language: "C++",
    username: "bob",
  }),

  // Wrong Answer
  wrongAnswer: createMockSubmission({
    id: "sub-wa-001",
    status: "WA",
    score: 60,
    execTime: 120,
    memoryUsage: 8192,
    username: "charlie",
  }),

  // Time Limit Exceeded
  timeLimitExceeded: createMockSubmission({
    id: "sub-tle-001",
    status: "TLE",
    score: 40,
    execTime: 2000,
    memoryUsage: 16384,
    language: "Python",
    username: "david",
  }),

  // Memory Limit Exceeded
  memoryLimitExceeded: createMockSubmission({
    id: "sub-mle-001",
    status: "MLE",
    score: 30,
    execTime: 150,
    memoryUsage: 262144,
    username: "eve",
  }),

  // Runtime Error
  runtimeError: createMockSubmission({
    id: "sub-re-001",
    status: "RE",
    score: 0,
    execTime: 10,
    memoryUsage: 2048,
    username: "alice",
  }),

  // Compile Error
  compileError: createMockSubmission({
    id: "sub-ce-001",
    status: "CE",
    score: 0,
    execTime: undefined,
    memoryUsage: undefined,
    language: "C++",
    username: "bob",
  }),

  // Pending
  pending: createMockSubmission({
    id: "sub-pending-001",
    status: "pending",
    score: undefined,
    execTime: undefined,
    memoryUsage: undefined,
    username: "charlie",
  }),

  // Judging
  judging: createMockSubmission({
    id: "sub-judging-001",
    status: "judging",
    score: undefined,
    execTime: undefined,
    memoryUsage: undefined,
    username: "david",
  }),
};

// =====================================================
// Submission Lists
// =====================================================

/**
 * Generate a list of random submissions
 */
export function generateMockSubmissions(count: number): Submission[] {
  const submissions: Submission[] = [];
  const users = Object.values(mockUsers);
  const problems = Object.values(mockSubmissionProblems);

  for (let i = 0; i < count; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const problem = problems[Math.floor(Math.random() * problems.length)];
    const status =
      SUBMISSION_STATUSES[Math.floor(Math.random() * SUBMISSION_STATUSES.length)];
    const language = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];

    submissions.push(
      createMockSubmission({
        id: `sub-${String(i + 1).padStart(3, "0")}`,
        problemId: problem.id,
        problemTitle: problem.title,
        userId: user.id,
        username: user.name,
        language,
        status,
        createdAt: new Date(
          Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)
        ),
      })
    );
  }

  return submissions;
}

// Pre-generated lists
export const mockSubmissionList = [
  mockSubmissions.accepted,
  mockSubmissions.wrongAnswer,
  mockSubmissions.timeLimitExceeded,
  mockSubmissions.memoryLimitExceeded,
  mockSubmissions.runtimeError,
  mockSubmissions.compileError,
  mockSubmissions.pending,
  mockSubmissions.judging,
];

export const mockSubmissionListByStatus = {
  accepted: [mockSubmissions.accepted, mockSubmissions.acceptedFast],
  failed: [
    mockSubmissions.wrongAnswer,
    mockSubmissions.timeLimitExceeded,
    mockSubmissions.memoryLimitExceeded,
    mockSubmissions.runtimeError,
    mockSubmissions.compileError,
  ],
  processing: [mockSubmissions.pending, mockSubmissions.judging],
};

// Random list for testing pagination
export const mockSubmissionListLarge = generateMockSubmissions(50);
