import { describe, it, expect } from "vitest";
import type { CodingProblemDetail } from "@/core/entities/problem.entity";
import {
  DEFAULT_PROBLEM_FORM_VALUES,
  type ProblemFormSchema,
} from "./problemFormSchema";
import {
  formSchemaToApiPayload,
  problemDetailToFormSchema,
} from "./problemFormAdapters";

describe("problemFormAdapters", () => {
  describe("problemDetailToFormSchema", () => {
    it("maps problem detail flat fields into form schema", () => {
      const detail: CodingProblemDetail = {
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
        isSolved: false,
        description: "中文描述",
        inputDescription: "輸入",
        outputDescription: "輸出",
        hint: "提示",
        timeLimit: 500,
        memoryLimit: 64,
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
      expect(result?.translationZh.title).toBe("Test Problem");
      expect(result?.translationZh.description).toBe("中文描述");
      expect(result?.translationZh.inputDescription).toBe("輸入");
      expect(result?.translationEn.title).toBe("");
      expect(result?.forbiddenKeywords).toEqual(["goto"]);
    });
  });

  describe("formSchemaToApiPayload", () => {
    it("builds payload with flat content fields and filters disabled languages", () => {
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
      expect(payload.description).toBe("描述");
      expect(payload.language_configs).toHaveLength(1);
      expect(payload.language_configs[0].language).toBe("cpp");
      expect(payload.existing_tag_ids).toEqual([1, 2]);
    });

    it("keeps language config in payload when language field is missing but index is known", () => {
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
          { language: "", templateCode: "int main(){}", isEnabled: true },
        ],
      };

      const payload = formSchemaToApiPayload(schema);

      expect(payload.language_configs).toEqual([
        {
          language: "cpp",
          template_code: "int main(){}",
          is_enabled: true,
          order: 0,
        },
      ]);
    });
  });
});
