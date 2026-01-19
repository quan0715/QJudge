import { describe, it, expect } from "vitest";
import { formatDate, getLanguageLabel, getDifficultyLabel } from "./format";

describe("Format Utilities", () => {
  describe("formatDate", () => {
    it("should format ISO date string to zh-TW locale", () => {
      const dateString = "2024-01-15T10:30:00.000Z";
      const result = formatDate(dateString);

      // Should contain date parts (actual format depends on locale)
      expect(result).toContain("2024");
      expect(result).toContain("01");
      expect(result).toContain("15");
    });

    it("should handle different date formats", () => {
      const dateString = "2023-12-25T00:00:00Z";
      const result = formatDate(dateString);

      expect(result).toContain("2023");
      expect(result).toContain("12");
      expect(result).toContain("25");
    });

    it("should include time in the formatted string", () => {
      const dateString = "2024-06-15T14:30:45.000Z";
      const result = formatDate(dateString);

      // Should have some time component (format varies by timezone)
      expect(result.length).toBeGreaterThan(10);
    });
  });

  describe("getLanguageLabel", () => {
    it("should return C++ for cpp", () => {
      expect(getLanguageLabel("cpp")).toBe("C++");
    });

    it("should return Python for python", () => {
      expect(getLanguageLabel("python")).toBe("Python");
    });

    it("should return Java for java", () => {
      expect(getLanguageLabel("java")).toBe("Java");
    });

    it("should return JavaScript for javascript", () => {
      expect(getLanguageLabel("javascript")).toBe("JavaScript");
    });

    it("should return C for c", () => {
      expect(getLanguageLabel("c")).toBe("C");
    });

    it("should return original value for unknown language", () => {
      // @ts-expect-error - testing unknown language
      expect(getLanguageLabel("rust")).toBe("rust");
    });
  });

  describe("getDifficultyLabel", () => {
    it("should return Easy for easy", () => {
      expect(getDifficultyLabel("easy")).toBe("Easy");
    });

    it("should return Medium for medium", () => {
      expect(getDifficultyLabel("medium")).toBe("Medium");
    });

    it("should return Hard for hard", () => {
      expect(getDifficultyLabel("hard")).toBe("Hard");
    });

    it("should return original value for unknown difficulty", () => {
      // @ts-expect-error - testing unknown difficulty
      expect(getDifficultyLabel("expert")).toBe("expert");
    });
  });
});
