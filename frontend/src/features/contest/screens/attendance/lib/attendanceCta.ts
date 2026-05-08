import type { AttendancePurpose } from "@/core/entities/contest.entity";
import type { AttendanceTranslate } from "./photoRequirements";

export type AttendanceCtaInput = {
  step: "scan" | "photo" | "photoReview" | "manual" | "confirm" | "done";
  cameraState: "requesting" | "ready" | "unavailable";
  scanState: "idle" | "detecting" | "validating" | "error";
  purpose: AttendancePurpose | null;
  manualReady: boolean;
  hasNextPhoto: boolean;
  uploading: boolean;
  uploadFailed: boolean;
};

export type CtaSpec = {
  label: string;
  disabled: boolean;
  loading: boolean;
};

const defaultTranslate: AttendanceTranslate = (_key, defaultValue, values) =>
  defaultValue.replace(/{{(\w+)}}/g, (_, name) =>
    String(values?.[name] ?? ""),
  );

const purposeLabel = (
  p: AttendancePurpose | null,
  tr: AttendanceTranslate,
) =>
  p === "check_out"
    ? tr("attendance.purpose.checkOut", "簽退")
    : tr("attendance.purpose.checkIn", "簽到");

export function getPrimaryCta(
  input: AttendanceCtaInput,
  tr: AttendanceTranslate = defaultTranslate,
): CtaSpec {
  const { step, cameraState, scanState, manualReady, hasNextPhoto, uploading, uploadFailed, purpose } = input;

  if (step === "scan") {
    if (cameraState === "requesting") {
      return {
        label: tr("attendance.cta.waitingCamera", "等待相機授權…"),
        disabled: true,
        loading: false,
      };
    }
    if (cameraState === "unavailable") {
      return {
        label: tr("attendance.cta.retryCamera", "重新嘗試相機"),
        disabled: false,
        loading: false,
      };
    }
    if (scanState === "validating") {
      return {
        label: tr("attendance.cta.validating", "驗證中…"),
        disabled: true,
        loading: true,
      };
    }
    if (scanState === "error") {
      return {
        label: tr("attendance.cta.realignment", "重新對準"),
        disabled: false,
        loading: false,
      };
    }
    return {
      label: tr("attendance.cta.scanning", "正在掃描…"),
      disabled: true,
      loading: false,
    };
  }
  if (step === "manual") {
    return {
      label: tr("attendance.cta.next", "下一步"),
      disabled: !manualReady,
      loading: false,
    };
  }
  if (step === "photo") {
    return {
      label: tr("attendance.cta.capturePurposePhoto", "拍攝{{purpose}}照片", {
        purpose: purposeLabel(purpose, tr),
      }),
      disabled: cameraState !== "ready",
      loading: false,
    };
  }
  if (step === "photoReview") {
    return {
      label: hasNextPhoto
        ? tr("attendance.cta.nextPhoto", "下一張")
        : tr("attendance.cta.confirmInfo", "確認資訊"),
      disabled: false,
      loading: false,
    };
  }
  if (step === "confirm") {
    if (uploadFailed) {
      return {
        label: tr("attendance.cta.retryUpload", "重試上傳"),
        disabled: false,
        loading: false,
      };
    }
    if (uploading) {
      return {
        label: tr("attendance.cta.uploading", "上傳中…"),
        disabled: true,
        loading: true,
      };
    }
    return {
      label: tr("attendance.cta.confirmUpload", "確認並上傳"),
      disabled: false,
      loading: false,
    };
  }
  return {
    label: tr("attendance.cta.backToExam", "返回考試"),
    disabled: false,
    loading: false,
  };
}

export type SecondaryCtaSpec = {
  label: string;
  action: "manual" | "rescan" | "retake" | "rescanFromConfirm" | "retakeFromConfirm" | "backToCamera";
} | null;

export function getSecondaryCta(
  input: AttendanceCtaInput,
  tr: AttendanceTranslate = defaultTranslate,
): SecondaryCtaSpec {
  const { step, cameraState, scanState } = input;
  if (step === "scan" && cameraState === "ready" && scanState !== "validating") {
    return { label: tr("attendance.cta.manualCode", "手動輸入代碼"), action: "manual" };
  }
  if (step === "scan" && cameraState === "unavailable") {
    return { label: tr("attendance.cta.manualCode", "手動輸入代碼"), action: "manual" };
  }
  if (step === "manual") {
    return cameraState === "unavailable"
      ? null
      : { label: tr("attendance.cta.backToScan", "返回掃描"), action: "backToCamera" };
  }
  if (step === "photoReview") {
    return { label: tr("attendance.cta.retake", "重拍"), action: "retake" };
  }
  if (step === "confirm") {
    return { label: tr("attendance.cta.retakePhotos", "重新拍攝"), action: "retakeFromConfirm" };
  }
  return null;
}
