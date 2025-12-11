import { describe, it, expect } from "vitest";
import {
  parseProblemYAML,
  convertYAMLToProblemData,
  type ProblemYAML,
} from "./problemYamlParser";

describe("Problem YAML Parser", () => {
  const validYAML = `
title: A+B Problem
difficulty: easy
time_limit: 1000
memory_limit: 256
translations:
  - language: zh-TW
    title: A+B 問題
    description: 計算兩數之和
    input_description: 兩個整數 A 和 B
    output_description: 輸出 A+B 的結果
test_cases:
  - input_data: "1 2"
    output_data: "3"
    is_sample: true
`;

  describe("parseProblemYAML", () => {
    it("should parse valid YAML successfully", () => {
      const result = parseProblemYAML(validYAML);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.title).toBe("A+B Problem");
      expect(result.data?.difficulty).toBe("easy");
      expect(result.data?.time_limit).toBe(1000);
      expect(result.data?.memory_limit).toBe(256);
    });

    it("should return error for invalid YAML syntax", () => {
      const invalidYAML = `
title: Test
  invalid: indentation
`;
      const result = parseProblemYAML(invalidYAML);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some((e) => e.field === "yaml")).toBe(true);
    });

    it("should validate required title field", () => {
      const yamlWithoutTitle = `
difficulty: easy
time_limit: 1000
memory_limit: 256
translations:
  - language: zh-TW
    title: Test
    description: Test
    input_description: Test
    output_description: Test
`;
      const result = parseProblemYAML(yamlWithoutTitle);

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.field === "title")).toBe(true);
    });

    it("should validate difficulty values", () => {
      const yamlWithInvalidDifficulty = `
title: Test
difficulty: super-hard
time_limit: 1000
memory_limit: 256
translations:
  - language: zh-TW
    title: Test
    description: Test
    input_description: Test
    output_description: Test
`;
      const result = parseProblemYAML(yamlWithInvalidDifficulty);

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.field === "difficulty")).toBe(true);
    });

    it("should validate time_limit range (100-10000)", () => {
      const yamlWithInvalidTimeLimit = `
title: Test
difficulty: easy
time_limit: 50
memory_limit: 256
translations:
  - language: zh-TW
    title: Test
    description: Test
    input_description: Test
    output_description: Test
`;
      const result = parseProblemYAML(yamlWithInvalidTimeLimit);

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.field === "time_limit")).toBe(true);
    });

    it("should validate memory_limit range (16-512)", () => {
      const yamlWithInvalidMemoryLimit = `
title: Test
difficulty: easy
time_limit: 1000
memory_limit: 1024
translations:
  - language: zh-TW
    title: Test
    description: Test
    input_description: Test
    output_description: Test
`;
      const result = parseProblemYAML(yamlWithInvalidMemoryLimit);

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.field === "memory_limit")).toBe(true);
    });

    it("should require at least one translation", () => {
      const yamlWithoutTranslations = `
title: Test
difficulty: easy
time_limit: 1000
memory_limit: 256
translations: []
`;
      const result = parseProblemYAML(yamlWithoutTranslations);

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.field === "translations")).toBe(true);
    });

    it("should validate translation fields", () => {
      const yamlWithIncompleteTranslation = `
title: Test
difficulty: easy
time_limit: 1000
memory_limit: 256
translations:
  - language: zh-TW
    title: Test
`;
      const result = parseProblemYAML(yamlWithIncompleteTranslation);

      expect(result.success).toBe(false);
      expect(
        result.errors?.some((e) => e.field.includes("translations[0]"))
      ).toBe(true);
    });

    it("should validate test_cases if provided", () => {
      const yamlWithInvalidTestCase = `
title: Test
difficulty: easy
time_limit: 1000
memory_limit: 256
translations:
  - language: zh-TW
    title: Test
    description: Test
    input_description: Test
    output_description: Test
test_cases:
  - input_data: "1 2"
    output_data: "3"
    is_sample: "yes"
`;
      const result = parseProblemYAML(yamlWithInvalidTestCase);

      expect(result.success).toBe(false);
      expect(
        result.errors?.some((e) => e.field.includes("test_cases[0].is_sample"))
      ).toBe(true);
    });

    it("should validate forbidden_keywords if provided", () => {
      const yamlWithInvalidKeywords = `
title: Test
difficulty: easy
time_limit: 1000
memory_limit: 256
translations:
  - language: zh-TW
    title: Test
    description: Test
    input_description: Test
    output_description: Test
forbidden_keywords: "not-an-array"
`;
      const result = parseProblemYAML(yamlWithInvalidKeywords);

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.field === "forbidden_keywords")).toBe(
        true
      );
    });

    it("should accept valid keyword restrictions", () => {
      const yamlWithKeywords = `
title: Test
difficulty: easy
time_limit: 1000
memory_limit: 256
translations:
  - language: zh-TW
    title: Test
    description: Test
    input_description: Test
    output_description: Test
forbidden_keywords:
  - goto
  - system
required_keywords:
  - for
`;
      const result = parseProblemYAML(yamlWithKeywords);

      expect(result.success).toBe(true);
      expect(result.data?.forbidden_keywords).toEqual(["goto", "system"]);
      expect(result.data?.required_keywords).toEqual(["for"]);
    });

    it("should return error for empty/null content", () => {
      const result = parseProblemYAML("");

      expect(result.success).toBe(false);
    });
  });

  describe("convertYAMLToProblemData", () => {
    const sampleYAML: ProblemYAML = {
      title: "Test Problem",
      difficulty: "medium",
      time_limit: 2000,
      memory_limit: 128,
      translations: [
        {
          language: "zh-TW",
          title: "測試題目",
          description: "描述",
          input_description: "輸入說明",
          output_description: "輸出說明",
          hint: "提示",
        },
      ],
      test_cases: [
        {
          input_data: "1",
          output_data: "1",
          is_sample: true,
        },
      ],
      language_configs: [
        {
          language: "cpp",
          template_code: "#include <iostream>",
        },
      ],
      forbidden_keywords: ["goto"],
      required_keywords: ["for"],
    };

    it("should convert YAML to problem data format", () => {
      const result = convertYAMLToProblemData(sampleYAML);

      expect(result.title).toBe("Test Problem");
      expect(result.difficulty).toBe("medium");
      expect(result.time_limit).toBe(2000);
      expect(result.memory_limit).toBe(128);
    });

    it("should set default values for is_visible and is_practice_visible", () => {
      const result = convertYAMLToProblemData(sampleYAML);

      expect(result.is_visible).toBe(true);
      expect(result.is_practice_visible).toBe(false);
    });

    it("should convert translations correctly", () => {
      const result = convertYAMLToProblemData(sampleYAML);

      expect(result.translations).toHaveLength(1);
      expect(result.translations[0].language).toBe("zh-TW");
      expect(result.translations[0].hint).toBe("提示");
    });

    it("should set default values for test_cases", () => {
      const result = convertYAMLToProblemData(sampleYAML);

      expect(result.test_cases).toHaveLength(1);
      expect(result.test_cases[0].score).toBe(0);
      expect(result.test_cases[0].order).toBe(0);
      expect(result.test_cases[0].is_hidden).toBe(false);
    });

    it("should set default values for language_configs", () => {
      const result = convertYAMLToProblemData(sampleYAML);

      expect(result.language_configs).toHaveLength(1);
      expect(result.language_configs[0].is_enabled).toBe(true);
      expect(result.language_configs[0].order).toBe(0);
    });

    it("should handle keyword restrictions", () => {
      const result = convertYAMLToProblemData(sampleYAML);

      expect(result.forbidden_keywords).toEqual(["goto"]);
      expect(result.required_keywords).toEqual(["for"]);
    });

    it("should handle empty arrays gracefully", () => {
      const minimalYAML: ProblemYAML = {
        title: "Minimal",
        difficulty: "easy",
        time_limit: 1000,
        memory_limit: 256,
        translations: [
          {
            language: "en",
            title: "Minimal",
            description: "Desc",
            input_description: "In",
            output_description: "Out",
          },
        ],
      };

      const result = convertYAMLToProblemData(minimalYAML);

      expect(result.test_cases).toEqual([]);
      expect(result.language_configs).toEqual([]);
      expect(result.forbidden_keywords).toEqual([]);
      expect(result.required_keywords).toEqual([]);
    });
  });
});
