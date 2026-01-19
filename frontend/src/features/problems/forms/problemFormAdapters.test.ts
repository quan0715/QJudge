import { describe, it, expect } from "vitest";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import type { ProblemYAML } from "@/shared/utils/problemYamlParser";
import {
  DEFAULT_PROBLEM_FORM_VALUES,
  type ProblemFormSchema,
} from "./problemFormSchema";
import {
  formSchemaToApiPayload,
  problemDetailToFormSchema,
  yamlToApiPayload,
  yamlToFormSchema,
} from "./problemFormAdapters";

describe("problemFormAdapters", () => {
  describe("problemDetailToFormSchema", () => {
    it("maps problem detail into form schema", () => {
      const detail: ProblemDetail = {
        id: "1",
        title: "Test Problem",
        difficulty: "easy",
        acceptanceRate: 0,
        submissionCount: 0,
        acceptedCount: 0,
        waCount: 0,
        tleCount: 0,
        mleCount: 0,
        reCount: 0,
        ceCount: 0,
        tags: [{ id: "10", name: "Math", slug: "math" }],
        isPracticeVisible: false,
        isVisible: true,
        isSolved: false,
        description: "Desc",
        timeLimit: 500,
        memoryLimit: 64,
        translations: [
          {
            language: "zh-TW",
            title: "中文標題",
            description: "中文描述",
            inputDescription: "輸入",
            outputDescription: "輸出",
            hint: "提示",
          },
        ],
        testCases: [],
        languageConfigs: [],
        forbiddenKeywords: ["goto"],
        requiredKeywords: ["for"],
      };

      const result = problemDetailToFormSchema(detail);

      expect(result?.title).toBe("Test Problem");
      expect(result?.difficulty).toBe("easy");
      expect(result?.timeLimit).toBe(500);
      expect(result?.memoryLimit).toBe(64);
      expect(result?.existingTagIds).toEqual([10]);
      expect(result?.translationZh.title).toBe("中文標題");
      expect(result?.translationEn.title).toBe("");
      expect(result?.forbiddenKeywords).toEqual(["goto"]);
    });
  });

  describe("yamlToFormSchema", () => {
    it("maps YAML translations, test cases, and language configs", () => {
      const yaml: ProblemYAML = {
        title: "YAML Problem",
        difficulty: "medium",
        time_limit: 1200,
        memory_limit: 128,
        translations: [
          {
            language: "zh-TW",
            title: "題目",
            description: "描述",
            input_description: "輸入",
            output_description: "輸出",
          },
          {
            language: "en",
            title: "Title",
            description: "Description",
            input_description: "Input",
            output_description: "Output",
          },
        ],
        test_cases: [
          {
            input_data: "1 2",
            output_data: "3",
            is_sample: true,
            is_hidden: true,
          },
        ],
        language_configs: [
          {
            language: "cpp",
            template_code: "#include <iostream>",
            is_enabled: false,
          },
        ],
        forbidden_keywords: ["goto"],
        required_keywords: ["for"],
      };

      const result = yamlToFormSchema(yaml);

      expect(result.title).toBe("YAML Problem");
      expect(result.translationZh.title).toBe("題目");
      expect(result.translationEn.title).toBe("Title");
      expect(result.testCases[0].isHidden).toBe(true);
      expect(result.languageConfigs[0].language).toBe("cpp");
    });
  });

  describe("formSchemaToApiPayload", () => {
    it("builds payload with translations and filters disabled languages", () => {
      const schema: ProblemFormSchema = {
        ...DEFAULT_PROBLEM_FORM_VALUES,
        title: "Form Problem",
        translationZh: {
          title: "標題",
          description: "描述",
          inputDescription: "",
          outputDescription: "",
          hint: "",
        },
        languageConfigs: [
          { language: "cpp", templateCode: "//", isEnabled: true },
          { language: "python", templateCode: "#", isEnabled: false },
        ],
        testCases: [
          {
            input: "1",
            output: "1",
            isSample: true,
          },
        ],
        existingTagIds: [1, 2],
      };

      const payload = formSchemaToApiPayload(schema);

      expect(payload.title).toBe("Form Problem");
      expect(payload.translations).toHaveLength(1);
      expect(payload.language_configs).toHaveLength(1);
      expect(payload.language_configs[0].language).toBe("cpp");
      expect(payload.existing_tag_ids).toEqual([1, 2]);
    });
  });

  describe("yamlToApiPayload", () => {
    it("sets defaults and converts arrays", () => {
      const yaml: ProblemYAML = {
        title: "YAML Problem",
        difficulty: "easy",
        time_limit: 1000,
        memory_limit: 256,
        translations: [
          {
            language: "en",
            title: "Title",
            description: "Desc",
            input_description: "In",
            output_description: "Out",
          },
        ],
      };

      const payload = yamlToApiPayload(yaml);

      expect(payload.is_visible).toBe(true);
      expect(payload.is_practice_visible).toBe(false);
      expect(payload.test_cases).toEqual([]);
      expect(payload.language_configs).toEqual([]);
      expect(payload.required_keywords).toEqual([]);
    });
  });
});
