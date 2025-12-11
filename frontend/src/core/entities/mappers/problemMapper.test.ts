import { describe, it, expect } from "vitest";
import { mapTagDto, mapProblemDto, mapProblemDetailDto } from "./problemMapper";

describe("Problem Mapper", () => {
  describe("mapTagDto", () => {
    it("should map tag DTO correctly", () => {
      const dto = {
        id: 1,
        name: "Array",
        slug: "array",
        description: "Problems involving arrays",
        color: "#3498db",
        created_at: "2024-01-01T00:00:00Z",
      };

      const result = mapTagDto(dto);

      expect(result.id).toBe("1");
      expect(result.name).toBe("Array");
      expect(result.slug).toBe("array");
      expect(result.description).toBe("Problems involving arrays");
      expect(result.color).toBe("#3498db");
      expect(result.createdAt).toBe("2024-01-01T00:00:00Z");
    });

    it("should handle missing optional fields", () => {
      const dto = {
        id: 1,
        name: "Test",
      };

      const result = mapTagDto(dto);

      expect(result.id).toBe("1");
      expect(result.name).toBe("Test");
      expect(result.slug).toBe("");
      expect(result.description).toBeUndefined();
      expect(result.color).toBeUndefined();
    });
  });

  describe("mapProblemDto", () => {
    it("should map problem DTO with full data", () => {
      const dto = {
        id: 123,
        display_id: "P001",
        title: "A+B Problem",
        difficulty: "easy",
        acceptance_rate: 85.5,
        submission_count: 1000,
        accepted_count: 855,
        created_by: "admin",
        tags: [
          { id: 1, name: "Math", slug: "math" },
          { id: 2, name: "Basic", slug: "basic" },
        ],
        is_practice_visible: true,
        is_visible: true,
        is_solved: false,
        created_at: "2024-01-15T10:00:00Z",
      };

      const result = mapProblemDto(dto);

      expect(result.id).toBe("123");
      expect(result.displayId).toBe("P001");
      expect(result.title).toBe("A+B Problem");
      expect(result.difficulty).toBe("easy");
      expect(result.acceptanceRate).toBe(85.5);
      expect(result.submissionCount).toBe(1000);
      expect(result.acceptedCount).toBe(855);
      expect(result.createdBy).toBe("admin");
      expect(result.tags).toHaveLength(2);
      expect(result.tags[0].name).toBe("Math");
      expect(result.isPracticeVisible).toBe(true);
      expect(result.isVisible).toBe(true);
      expect(result.isSolved).toBe(false);
      expect(result.createdAt).toBe("2024-01-15T10:00:00Z");
    });

    it("should handle missing fields with defaults", () => {
      const dto = {
        id: 1,
      };

      const result = mapProblemDto(dto);

      expect(result.id).toBe("1");
      expect(result.title).toBe("");
      expect(result.difficulty).toBe("medium");
      expect(result.acceptanceRate).toBe(0);
      expect(result.submissionCount).toBe(0);
      expect(result.acceptedCount).toBe(0);
      expect(result.tags).toEqual([]);
      expect(result.isPracticeVisible).toBe(false);
      expect(result.isVisible).toBe(true);
      expect(result.isSolved).toBe(false);
      expect(result.createdInContest).toBeNull();
    });

    it("should handle created_in_contest field", () => {
      const dto = {
        id: 1,
        created_in_contest: {
          id: 10,
          title: "Weekly Contest #1",
          start_time: "2024-01-15T10:00:00Z",
          end_time: "2024-01-15T12:00:00Z",
        },
      };

      const result = mapProblemDto(dto);

      expect(result.createdInContest).not.toBeNull();
      expect(result.createdInContest?.id).toBe("10");
      expect(result.createdInContest?.title).toBe("Weekly Contest #1");
      expect(result.createdInContest?.startTime).toBe("2024-01-15T10:00:00Z");
      expect(result.createdInContest?.endTime).toBe("2024-01-15T12:00:00Z");
    });

    it("should convert boolean fields correctly", () => {
      const dtoWithTrue = {
        id: 1,
        is_practice_visible: true,
        is_visible: true,
        is_solved: true,
      };
      const dtoWithFalse = {
        id: 1,
        is_practice_visible: false,
        is_visible: false,
        is_solved: false,
      };

      const resultTrue = mapProblemDto(dtoWithTrue);
      const resultFalse = mapProblemDto(dtoWithFalse);

      expect(resultTrue.isPracticeVisible).toBe(true);
      expect(resultTrue.isVisible).toBe(true);
      expect(resultTrue.isSolved).toBe(true);

      expect(resultFalse.isPracticeVisible).toBe(false);
      expect(resultFalse.isVisible).toBe(false);
      expect(resultFalse.isSolved).toBe(false);
    });
  });

  describe("mapProblemDetailDto", () => {
    it("should map problem detail with all fields", () => {
      const dto = {
        id: 1,
        title: "Test Problem",
        difficulty: "medium",
        description: "Problem description",
        input_description: "Input format",
        output_description: "Output format",
        hint: "Use dynamic programming",
        time_limit: 1000,
        memory_limit: 256,
        samples: [{ input: "1 2", output: "3", explanation: "1+2=3" }],
        translations: [
          {
            language: "zh-TW",
            title: "測試題目",
            description: "題目描述",
            input_description: "輸入格式",
            output_description: "輸出格式",
            hint: "使用動態規劃",
          },
        ],
        test_cases: [
          {
            input_data: "1 2",
            output_data: "3",
            is_sample: true,
            is_hidden: false,
            score: 10,
          },
        ],
        language_configs: [
          {
            language: "cpp",
            template_code: "#include <iostream>",
            is_enabled: true,
          },
        ],
        forbidden_keywords: ["goto", "system"],
        required_keywords: ["for"],
      };

      const result = mapProblemDetailDto(dto);

      expect(result.description).toBe("Problem description");
      expect(result.inputDescription).toBe("Input format");
      expect(result.outputDescription).toBe("Output format");
      expect(result.hint).toBe("Use dynamic programming");
      expect(result.timeLimit).toBe(1000);
      expect(result.memoryLimit).toBe(256);

      expect(result.samples).toHaveLength(1);
      expect(result.samples[0].input).toBe("1 2");
      expect(result.samples[0].output).toBe("3");

      expect(result.translations).toHaveLength(1);
      expect(result.translations[0].language).toBe("zh-TW");

      expect(result.testCases).toHaveLength(1);
      expect(result.testCases[0].input).toBe("1 2");
      expect(result.testCases[0].isSample).toBe(true);

      expect(result.languageConfigs).toHaveLength(1);
      expect(result.languageConfigs[0].language).toBe("cpp");
      expect(result.languageConfigs[0].isEnabled).toBe(true);

      expect(result.forbiddenKeywords).toEqual(["goto", "system"]);
      expect(result.requiredKeywords).toEqual(["for"]);
    });

    it("should handle empty arrays", () => {
      const dto = {
        id: 1,
        title: "Minimal",
      };

      const result = mapProblemDetailDto(dto);

      expect(result.samples).toEqual([]);
      expect(result.translations).toEqual([]);
      expect(result.testCases).toEqual([]);
      expect(result.languageConfigs).toEqual([]);
      expect(result.forbiddenKeywords).toEqual([]);
      expect(result.requiredKeywords).toEqual([]);
    });

    it("should include base problem fields", () => {
      const dto = {
        id: 123,
        display_id: "P001",
        title: "Test",
        difficulty: "hard",
        tags: [{ id: 1, name: "DP", slug: "dp" }],
        is_solved: true,
      };

      const result = mapProblemDetailDto(dto);

      expect(result.id).toBe("123");
      expect(result.displayId).toBe("P001");
      expect(result.difficulty).toBe("hard");
      expect(result.tags).toHaveLength(1);
      expect(result.isSolved).toBe(true);
    });

    it("should map test cases correctly", () => {
      const dto = {
        id: 1,
        test_cases: [
          {
            input_data: "a",
            output_data: "b",
            is_sample: true,
            is_hidden: false,
            score: 5,
          },
          {
            input_data: "c",
            output_data: "d",
            is_sample: false,
            is_hidden: true,
            score: 10,
          },
        ],
      };

      const result = mapProblemDetailDto(dto);

      expect(result.testCases).toHaveLength(2);
      expect(result.testCases[0]).toEqual({
        input: "a",
        output: "b",
        isSample: true,
        isHidden: false,
        score: 5,
        explanation: undefined,
      });
      expect(result.testCases[1].isHidden).toBe(true);
    });
  });
});
