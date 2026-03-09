import { describe, it, expect } from "vitest";
import { DIFFICULTY_CONFIG, getDifficultyConfig } from "./difficulty.config";
import type { Difficulty } from "@/core/entities/problem.entity";

describe("Difficulty Config", () => {
  describe("DIFFICULTY_CONFIG", () => {
    it("should have config for easy difficulty", () => {
      expect(DIFFICULTY_CONFIG["easy"]).toEqual({
        color: "green",
        labelKey: "difficulty.easy",
        type: "green",
      });
    });

    it("should have config for medium difficulty", () => {
      expect(DIFFICULTY_CONFIG["medium"]).toEqual({
        color: "cyan",
        labelKey: "difficulty.medium",
        type: "cyan",
      });
    });

    it("should have config for hard difficulty", () => {
      expect(DIFFICULTY_CONFIG["hard"]).toEqual({
        color: "red",
        labelKey: "difficulty.hard",
        type: "red",
      });
    });
  });

  describe("getDifficultyConfig", () => {
    it("should return correct config for easy", () => {
      const config = getDifficultyConfig("easy");

      expect(config.color).toBe("green");
      expect(config.labelKey).toBe("difficulty.easy");
      expect(config.type).toBe("green");
    });

    it("should return correct config for medium", () => {
      const config = getDifficultyConfig("medium");

      expect(config.color).toBe("cyan");
      expect(config.labelKey).toBe("difficulty.medium");
      expect(config.type).toBe("cyan");
    });

    it("should return correct config for hard", () => {
      const config = getDifficultyConfig("hard");

      expect(config.color).toBe("red");
      expect(config.labelKey).toBe("difficulty.hard");
      expect(config.type).toBe("red");
    });

    it("should return default config for unknown difficulty", () => {
      // @ts-expect-error - testing unknown difficulty
      const config = getDifficultyConfig("expert");

      expect(config).toEqual({
        color: "gray",
        labelKey: "expert",
        type: "gray",
      });
    });

    it("should return all required fields", () => {
      const difficulties: Difficulty[] = ["easy", "medium", "hard"];

      difficulties.forEach((diff) => {
        const config = getDifficultyConfig(diff);
        expect(config).toHaveProperty("color");
        expect(config).toHaveProperty("labelKey");
        expect(config).toHaveProperty("type");
      });
    });
  });
});
