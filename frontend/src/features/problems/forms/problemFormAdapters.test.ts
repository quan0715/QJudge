import { describe, it, expect } from "vitest";
import type { CodingProblemDetail } from "@/core/entities/problem.entity";
import {
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

});
