import { describe, it, expect } from "vitest";
import { SUBMISSION_STATUS_CONFIG, getStatusConfig } from "./statusConfig";
import type { SubmissionStatus } from "@/core/entities/submission.entity";

describe("Status Config", () => {
  describe("SUBMISSION_STATUS_CONFIG", () => {
    it("should have config for AC status", () => {
      expect(SUBMISSION_STATUS_CONFIG["AC"]).toEqual({
        color: "green",
        label: "通過",
        type: "green",
      });
    });

    it("should have config for WA status", () => {
      expect(SUBMISSION_STATUS_CONFIG["WA"]).toEqual({
        color: "red",
        label: "答案錯誤",
        type: "red",
      });
    });

    it("should have config for TLE status", () => {
      expect(SUBMISSION_STATUS_CONFIG["TLE"]).toEqual({
        color: "purple",
        label: "超時",
        type: "purple",
      });
    });

    it("should have config for MLE status", () => {
      expect(SUBMISSION_STATUS_CONFIG["MLE"]).toEqual({
        color: "purple",
        label: "記憶體超限",
        type: "purple",
      });
    });

    it("should have config for RE status", () => {
      expect(SUBMISSION_STATUS_CONFIG["RE"]).toEqual({
        color: "red",
        label: "執行錯誤",
        type: "red",
      });
    });

    it("should have config for CE status", () => {
      expect(SUBMISSION_STATUS_CONFIG["CE"]).toEqual({
        color: "red",
        label: "編譯錯誤",
        type: "red",
      });
    });

    it("should have config for pending status", () => {
      expect(SUBMISSION_STATUS_CONFIG["pending"]).toEqual({
        color: "gray",
        label: "等待中",
        type: "gray",
      });
    });

    it("should have config for judging status", () => {
      expect(SUBMISSION_STATUS_CONFIG["judging"]).toEqual({
        color: "blue",
        label: "評測中",
        type: "blue",
      });
    });

    it("should have config for SE status", () => {
      expect(SUBMISSION_STATUS_CONFIG["SE"]).toEqual({
        color: "red",
        label: "系統錯誤",
        type: "red",
      });
    });

    it("should have config for NS status", () => {
      expect(SUBMISSION_STATUS_CONFIG["NS"]).toEqual({
        color: "gray",
        label: "未提交",
        type: "gray",
      });
    });
  });

  describe("getStatusConfig", () => {
    it("should return correct config for known status", () => {
      const statuses: SubmissionStatus[] = [
        "AC",
        "WA",
        "TLE",
        "MLE",
        "RE",
        "CE",
        "NS",
        "pending",
        "judging",
        "SE",
      ];

      statuses.forEach((status) => {
        const config = getStatusConfig(status);
        expect(config).toBeDefined();
        expect(config.color).toBeDefined();
        expect(config.label).toBeDefined();
        expect(config.type).toBeDefined();
      });
    });

    it("should return default config for unknown status", () => {
      // @ts-expect-error - testing unknown status
      const config = getStatusConfig("UNKNOWN");

      expect(config).toEqual({
        color: "gray",
        label: "UNKNOWN",
        type: "gray",
      });
    });

    it("should return green type for AC", () => {
      const config = getStatusConfig("AC");
      expect(config.type).toBe("green");
    });

    it("should return red type for error statuses", () => {
      const errorStatuses: SubmissionStatus[] = ["WA", "RE", "CE", "SE"];

      errorStatuses.forEach((status) => {
        const config = getStatusConfig(status);
        expect(config.type).toBe("red");
      });
    });

    it("should return purple type for limit exceeded statuses", () => {
      const limitStatuses: SubmissionStatus[] = ["TLE", "MLE"];

      limitStatuses.forEach((status) => {
        const config = getStatusConfig(status);
        expect(config.type).toBe("purple");
      });
    });
  });
});
