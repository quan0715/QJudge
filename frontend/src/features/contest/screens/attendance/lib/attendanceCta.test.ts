import { describe, expect, it } from "vitest";

import {
  getPrimaryCta,
  getSecondaryCta,
  type AttendanceCtaInput,
} from "./attendanceCta";

const baseInput: AttendanceCtaInput = {
  step: "scan",
  cameraState: "ready",
  scanState: "idle",
  purpose: "check_in",
  manualReady: false,
  hasNextPhoto: false,
  uploading: false,
  uploadFailed: false,
};

const input = (overrides: Partial<AttendanceCtaInput>): AttendanceCtaInput => ({
  ...baseInput,
  ...overrides,
});

describe("getPrimaryCta", () => {
  describe("scan step", () => {
    it.each([
      ["requesting", true, false, "等待相機授權…"],
      ["unavailable", false, false, "重新嘗試相機"],
    ] as const)("camera=%s → disabled=%s loading=%s label=%s", (cameraState, disabled, loading, label) => {
      const cta = getPrimaryCta(input({ step: "scan", cameraState }));
      expect(cta).toEqual({ label, disabled, loading });
    });

    it("camera ready + scan validating shows loading state", () => {
      expect(
        getPrimaryCta(input({ step: "scan", cameraState: "ready", scanState: "validating" })),
      ).toEqual({ label: "驗證中…", disabled: true, loading: true });
    });

    it("camera ready + scan error shows realignment CTA enabled", () => {
      expect(
        getPrimaryCta(input({ step: "scan", cameraState: "ready", scanState: "error" })),
      ).toEqual({ label: "重新對準", disabled: false, loading: false });
    });

    it("camera ready + scan idle shows scanning CTA disabled", () => {
      expect(
        getPrimaryCta(input({ step: "scan", cameraState: "ready", scanState: "idle" })),
      ).toEqual({ label: "正在掃描…", disabled: true, loading: false });
    });
  });

  describe("manual step", () => {
    it("disabled when manual code not ready", () => {
      expect(
        getPrimaryCta(input({ step: "manual", manualReady: false })),
      ).toEqual({ label: "下一步", disabled: true, loading: false });
    });

    it("enabled once manual code is ready", () => {
      expect(
        getPrimaryCta(input({ step: "manual", manualReady: true })),
      ).toEqual({ label: "下一步", disabled: false, loading: false });
    });
  });

  describe("photo step", () => {
    it("disabled until camera is ready", () => {
      expect(
        getPrimaryCta(input({ step: "photo", cameraState: "requesting", purpose: "check_in" })),
      ).toEqual({ label: "拍攝簽到照片", disabled: true, loading: false });
    });

    it("uses check-out label when purpose is check_out", () => {
      expect(
        getPrimaryCta(input({ step: "photo", cameraState: "ready", purpose: "check_out" })),
      ).toEqual({ label: "拍攝簽退照片", disabled: false, loading: false });
    });

    it("falls back to check-in label when purpose is null", () => {
      expect(
        getPrimaryCta(input({ step: "photo", cameraState: "ready", purpose: null })),
      ).toEqual({ label: "拍攝簽到照片", disabled: false, loading: false });
    });
  });

  describe("photoReview step", () => {
    it("shows next-photo label when more photos remain", () => {
      expect(
        getPrimaryCta(input({ step: "photoReview", hasNextPhoto: true })),
      ).toEqual({ label: "下一張", disabled: false, loading: false });
    });

    it("shows confirm label when no more photos", () => {
      expect(
        getPrimaryCta(input({ step: "photoReview", hasNextPhoto: false })),
      ).toEqual({ label: "確認資訊", disabled: false, loading: false });
    });
  });

  describe("confirm step", () => {
    it("idle confirm shows the upload CTA enabled", () => {
      expect(getPrimaryCta(input({ step: "confirm" }))).toEqual({
        label: "確認並上傳",
        disabled: false,
        loading: false,
      });
    });

    it("uploading state shows loading indicator", () => {
      expect(
        getPrimaryCta(input({ step: "confirm", uploading: true })),
      ).toEqual({ label: "上傳中…", disabled: true, loading: true });
    });

    it("uploadFailed takes precedence over uploading", () => {
      expect(
        getPrimaryCta(input({ step: "confirm", uploading: true, uploadFailed: true })),
      ).toEqual({ label: "重試上傳", disabled: false, loading: false });
    });
  });

  describe("done step", () => {
    it("returns the back-to-exam CTA", () => {
      expect(getPrimaryCta(input({ step: "done" }))).toEqual({
        label: "返回考試",
        disabled: false,
        loading: false,
      });
    });
  });
});

describe("getSecondaryCta", () => {
  it("scan step + camera ready offers manual entry", () => {
    expect(
      getSecondaryCta(input({ step: "scan", cameraState: "ready", scanState: "idle" })),
    ).toEqual({ label: "手動輸入代碼", action: "manual" });
  });

  it("scan step + camera unavailable offers manual entry", () => {
    expect(
      getSecondaryCta(input({ step: "scan", cameraState: "unavailable" })),
    ).toEqual({ label: "手動輸入代碼", action: "manual" });
  });

  it("scan step + scan validating hides secondary action", () => {
    expect(
      getSecondaryCta(input({ step: "scan", cameraState: "ready", scanState: "validating" })),
    ).toBeNull();
  });

  it("manual step + camera ready offers back-to-camera", () => {
    expect(
      getSecondaryCta(input({ step: "manual", cameraState: "ready" })),
    ).toEqual({ label: "返回掃描", action: "backToCamera" });
  });

  it("manual step + camera unavailable hides back-to-camera", () => {
    expect(
      getSecondaryCta(input({ step: "manual", cameraState: "unavailable" })),
    ).toBeNull();
  });

  it("photoReview step offers retake", () => {
    expect(
      getSecondaryCta(input({ step: "photoReview" })),
    ).toEqual({ label: "重拍", action: "retake" });
  });

  it("confirm step offers retake-from-confirm", () => {
    expect(
      getSecondaryCta(input({ step: "confirm" })),
    ).toEqual({ label: "重新拍攝", action: "retakeFromConfirm" });
  });

  it.each(["photo", "done"] as const)("%s step has no secondary action", (step) => {
    expect(getSecondaryCta(input({ step }))).toBeNull();
  });
});
