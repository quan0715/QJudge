import type { Problem, Tag, Difficulty } from "@/core/entities/problem.entity";

// =====================================================
// Tags Mock Data
// =====================================================
export const mockTags: Record<string, Tag> = {
  array: { id: "1", name: "陣列", slug: "array" },
  hashTable: { id: "2", name: "雜湊表", slug: "hash-table" },
  linkedList: { id: "3", name: "鏈結串列", slug: "linked-list" },
  math: { id: "4", name: "數學", slug: "math" },
  recursion: { id: "5", name: "遞迴", slug: "recursion" },
  binarySearch: { id: "6", name: "二分搜尋", slug: "binary-search" },
  divideAndConquer: { id: "7", name: "分治法", slug: "divide-and-conquer" },
  string: { id: "8", name: "字串", slug: "string" },
  dp: { id: "9", name: "動態規劃", slug: "dp" },
  greedy: { id: "10", name: "貪心", slug: "greedy" },
  backtracking: { id: "11", name: "回溯", slug: "backtracking" },
  slidingWindow: { id: "12", name: "滑動視窗", slug: "sliding-window" },
  tree: { id: "13", name: "樹", slug: "tree" },
  graph: { id: "14", name: "圖", slug: "graph" },
  sorting: { id: "15", name: "排序", slug: "sorting" },
};

// =====================================================
// Problem Factory
// =====================================================
interface CreateProblemOptions {
  id?: string;
  displayId?: string;
  title?: string;
  difficulty?: Difficulty;
  acceptanceRate?: number;
  submissionCount?: number;
  tags?: Tag[];
  isSolved?: boolean;
  isPracticeVisible?: boolean;
  isVisible?: boolean;
}

export function createMockProblem(options: CreateProblemOptions = {}): Problem {
  const {
    id = "1",
    displayId = `P${id.padStart(3, "0")}`,
    title = "Sample Problem",
    difficulty = "easy",
    acceptanceRate = 50,
    submissionCount = 100,
    tags = [],
    isSolved = false,
    isPracticeVisible = true,
    isVisible = true,
  } = options;

  const acceptedCount = Math.round(submissionCount * (acceptanceRate / 100));
  const remaining = submissionCount - acceptedCount;

  return {
    id,
    displayId,
    title,
    difficulty,
    acceptanceRate,
    submissionCount,
    acceptedCount,
    waCount: Math.round(remaining * 0.5),
    tleCount: Math.round(remaining * 0.2),
    mleCount: Math.round(remaining * 0.1),
    reCount: Math.round(remaining * 0.1),
    ceCount: Math.round(remaining * 0.1),
    tags,
    isSolved,
    isPracticeVisible,
    isVisible,
  };
}

// =====================================================
// Pre-defined Problems
// =====================================================
export const mockProblems = {
  // Easy problems
  twoSum: createMockProblem({
    id: "1",
    title: "Two Sum",
    difficulty: "easy",
    acceptanceRate: 85.5,
    submissionCount: 1000,
    tags: [mockTags.array, mockTags.hashTable],
    isSolved: false,
  }),

  palindromeNumber: createMockProblem({
    id: "9",
    title: "Palindrome Number",
    difficulty: "easy",
    acceptanceRate: 72.3,
    submissionCount: 800,
    tags: [mockTags.math],
    isSolved: true,
  }),

  // Medium problems
  addTwoNumbers: createMockProblem({
    id: "2",
    title: "Add Two Numbers",
    difficulty: "medium",
    acceptanceRate: 52.3,
    submissionCount: 500,
    tags: [mockTags.linkedList, mockTags.math, mockTags.recursion],
    isSolved: true,
  }),

  longestSubstring: createMockProblem({
    id: "3",
    title: "Longest Substring Without Repeating Characters",
    difficulty: "medium",
    acceptanceRate: 45.8,
    submissionCount: 600,
    tags: [mockTags.string, mockTags.slidingWindow, mockTags.hashTable],
    isSolved: false,
  }),

  // Hard problems
  medianOfTwoArrays: createMockProblem({
    id: "4",
    title: "Median of Two Sorted Arrays",
    difficulty: "hard",
    acceptanceRate: 28.7,
    submissionCount: 300,
    tags: [mockTags.array, mockTags.binarySearch, mockTags.divideAndConquer],
    isSolved: false,
  }),

  regularExpressionMatching: createMockProblem({
    id: "10",
    title: "Regular Expression Matching",
    difficulty: "hard",
    acceptanceRate: 18.5,
    submissionCount: 200,
    tags: [mockTags.string, mockTags.dp, mockTags.recursion],
    isSolved: false,
  }),

  // Edge cases
  noTags: createMockProblem({
    id: "100",
    title: "Problem Without Tags",
    difficulty: "easy",
    acceptanceRate: 60,
    tags: [],
  }),

  manyTags: createMockProblem({
    id: "101",
    title: "Problem With Many Tags",
    difficulty: "medium",
    acceptanceRate: 40,
    tags: [
      mockTags.array,
      mockTags.string,
      mockTags.dp,
      mockTags.greedy,
      mockTags.backtracking,
    ],
  }),

  lowAcceptance: createMockProblem({
    id: "102",
    title: "Very Hard Problem",
    difficulty: "hard",
    acceptanceRate: 12.5,
    tags: [mockTags.graph, mockTags.dp],
  }),

  highAcceptance: createMockProblem({
    id: "103",
    title: "Very Easy Problem",
    difficulty: "easy",
    acceptanceRate: 95.8,
    tags: [mockTags.math],
    isSolved: true,
  }),
};

// =====================================================
// Problem Lists
// =====================================================
export const mockProblemList = [
  mockProblems.twoSum,
  mockProblems.addTwoNumbers,
  mockProblems.longestSubstring,
  mockProblems.medianOfTwoArrays,
  mockProblems.palindromeNumber,
];

export const mockProblemListByDifficulty = {
  easy: [mockProblems.twoSum, mockProblems.palindromeNumber, mockProblems.highAcceptance],
  medium: [mockProblems.addTwoNumbers, mockProblems.longestSubstring, mockProblems.manyTags],
  hard: [mockProblems.medianOfTwoArrays, mockProblems.regularExpressionMatching, mockProblems.lowAcceptance],
};
