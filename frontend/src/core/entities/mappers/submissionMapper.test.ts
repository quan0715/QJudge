import { describe, it, expect } from "vitest";
import {
  mapTestResultDto,
  mapSubmissionDto,
  mapSubmissionDetailDto,
} from "./submissionMapper";

describe("Submission Mapper", () => {
  describe("mapTestResultDto", () => {
    it("should map test result DTO correctly", () => {
      const dto = {
        id: 1,
        test_case: 5,
        is_hidden: true,
        status: "AC",
        exec_time: 100,
        memory_usage: 1024,
        error_message: null,
        input: "1 2",
        output: "3",
        expected_output: "3",
      };

      const result = mapTestResultDto(dto);

      expect(result.id).toBe(1);
      expect(result.testCaseId).toBe(5);
      expect(result.isHidden).toBe(true);
      expect(result.status).toBe("AC");
      expect(result.execTime).toBe(100);
      expect(result.memoryUsage).toBe(1024);
      expect(result.input).toBe("1 2");
      expect(result.output).toBe("3");
      expect(result.expectedOutput).toBe("3");
    });

    it("should handle missing optional fields", () => {
      const dto = {
        id: 1,
        test_case: 1,
        status: "WA",
      };

      const result = mapTestResultDto(dto);

      expect(result.execTime).toBe(0);
      expect(result.memoryUsage).toBe(0);
      expect(result.isHidden).toBe(false);
    });

    it("should convert is_hidden to boolean", () => {
      const dtoWithFalse = {
        id: 1,
        test_case: 1,
        status: "AC",
        is_hidden: false,
      };
      const dtoWithUndefined = { id: 1, test_case: 1, status: "AC" };
      const dtoWithNull = {
        id: 1,
        test_case: 1,
        status: "AC",
        is_hidden: null,
      };

      expect(mapTestResultDto(dtoWithFalse).isHidden).toBe(false);
      expect(mapTestResultDto(dtoWithUndefined).isHidden).toBe(false);
      expect(mapTestResultDto(dtoWithNull).isHidden).toBe(false);
    });
  });

  describe("mapSubmissionDto", () => {
    it("should map submission DTO with full data", () => {
      const dto = {
        id: 123,
        problem: { id: 456, title: "A+B Problem" },
        user: { id: 789, username: "testuser" },
        language: "cpp",
        status: "AC",
        score: 100,
        exec_time: 50,
        memory_usage: 2048,
        created_at: "2024-01-15T10:00:00Z",
        contest: 10,
        is_test: false,
      };

      const result = mapSubmissionDto(dto);

      expect(result.id).toBe("123");
      expect(result.problemId).toBe("456");
      expect(result.problemTitle).toBe("A+B Problem");
      expect(result.userId).toBe("789");
      expect(result.username).toBe("testuser");
      expect(result.language).toBe("cpp");
      expect(result.status).toBe("AC");
      expect(result.score).toBe(100);
      expect(result.execTime).toBe(50);
      expect(result.memoryUsage).toBe(2048);
      expect(result.createdAt).toBe("2024-01-15T10:00:00Z");
      expect(result.contestId).toBe("10");
      expect(result.isTest).toBe(false);
    });

    it("should handle problem as ID only", () => {
      const dto = {
        id: 1,
        problem: 42,
        user: 1,
        language: "python",
        status: "pending",
      };

      const result = mapSubmissionDto(dto);

      expect(result.problemId).toBe("42");
      expect(result.problemTitle).toBeUndefined();
    });

    it("should handle alternative field names", () => {
      const dto = {
        id: 1,
        problem_id: 42,
        user_id: 10,
        execution_time: 100,
        createdAt: "2024-01-01T00:00:00Z",
        language: "cpp",
        status: "AC",
      };

      const result = mapSubmissionDto(dto);

      expect(result.problemId).toBe("42");
      expect(result.userId).toBe("10");
      expect(result.execTime).toBe(100);
      expect(result.createdAt).toBe("2024-01-01T00:00:00Z");
    });

    it("should handle missing fields with defaults", () => {
      const dto = {
        id: 1,
      };

      const result = mapSubmissionDto(dto);

      expect(result.id).toBe("1");
      expect(result.problemId).toBe("");
      expect(result.userId).toBe("");
      expect(result.language).toBe("");
      expect(result.status).toBe("pending");
      expect(result.execTime).toBe(0);
      expect(result.createdAt).toBe("");
      expect(result.isTest).toBe(false);
    });

    it("should convert is_test to boolean", () => {
      const dtoWithTrue = { id: 1, is_test: true };
      const dtoWithFalse = { id: 1, is_test: false };
      const dtoWithUndefined = { id: 1 };

      expect(mapSubmissionDto(dtoWithTrue).isTest).toBe(true);
      expect(mapSubmissionDto(dtoWithFalse).isTest).toBe(false);
      expect(mapSubmissionDto(dtoWithUndefined).isTest).toBe(false);
    });
  });

  describe("mapSubmissionDetailDto", () => {
    it("should map submission detail with code and results", () => {
      const dto = {
        id: 1,
        problem: { id: 1, title: "Test" },
        user: {
          id: 1,
          username: "user",
          email: "user@test.com",
          role: "student",
        },
        language: "cpp",
        status: "AC",
        code: "#include <iostream>\nint main() { return 0; }",
        error_message: null,
        results: [
          {
            id: 1,
            test_case: 1,
            status: "AC",
            exec_time: 10,
            memory_usage: 100,
          },
          {
            id: 2,
            test_case: 2,
            status: "AC",
            exec_time: 15,
            memory_usage: 120,
          },
        ],
        custom_test_cases: [{ input: "1", output: "1" }],
      };

      const result = mapSubmissionDetailDto(dto);

      expect(result.code).toBe("#include <iostream>\nint main() { return 0; }");
      expect(result.user).toBeDefined();
      expect(result.user?.username).toBe("user");
      expect(result.user?.email).toBe("user@test.com");
      expect(result.results).toHaveLength(2);
      expect(result.results?.[0].status).toBe("AC");
      expect(result.customTestCases).toHaveLength(1);
    });

    it("should handle missing optional fields", () => {
      const dto = {
        id: 1,
        language: "python",
        status: "pending",
      };

      const result = mapSubmissionDetailDto(dto);

      expect(result.code).toBe("");
      expect(result.user).toBeUndefined();
      expect(result.problem).toBeUndefined();
      expect(result.results).toEqual([]);
      expect(result.customTestCases).toEqual([]);
    });

    it("should include base submission fields", () => {
      const dto = {
        id: 123,
        problem: 456,
        user: { id: 789, username: "tester" },
        language: "java",
        status: "WA",
        score: 50,
        created_at: "2024-06-15T12:00:00Z",
      };

      const result = mapSubmissionDetailDto(dto);

      expect(result.id).toBe("123");
      expect(result.problemId).toBe("456");
      expect(result.userId).toBe("789");
      expect(result.language).toBe("java");
      expect(result.status).toBe("WA");
      expect(result.score).toBe(50);
    });
  });
});
