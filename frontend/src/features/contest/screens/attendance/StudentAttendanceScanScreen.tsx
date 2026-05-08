import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import type {
  AttendancePhotoKind,
  AttendancePhotoPolicy,
  AttendancePurpose,
} from "@/core/entities/contest.entity";
import { parseAttendanceQrValue } from "@/features/contest/attendance/attendanceQr";
import { createAttendanceEvent } from "@/infrastructure/api/repositories/attendance.repository";
import { getContest } from "@/infrastructure/api/repositories/contest.repository";
import {
  confirmEvidenceUpload,
  createEvidenceUploadIntent,
} from "@/infrastructure/api/repositories/exam.repository";

import { AttendanceShell } from "./components/AttendanceShell";
import { ConfirmContent } from "./components/ConfirmContent";
import { DoneContent } from "./components/DoneContent";
import { DynamicFooter } from "./components/DynamicFooter";
import { ManualCodeContent } from "./components/ManualCodeContent";
import { PhotoContent } from "./components/PhotoContent";
import { ScanContent } from "./components/ScanContent";
import { ShutterRow } from "./components/ShutterRow";
import { useCameraStream } from "./hooks/useCameraStream";
import { useHaptics } from "./hooks/useHaptics";
import { useQrScanner } from "./hooks/useQrScanner";
import {
  type AttendanceCtaInput,
  getPrimaryCta,
  getSecondaryCta,
} from "./lib/attendanceCta";
import { type FrameHintStatus } from "./lib/frameHint";
import {
  getPhotoRequirementsByPolicy,
  type AttendanceTranslate,
} from "./lib/photoRequirements";

type ScanState = "scanning" | "validating" | "capturing" | "submitting" | "done";
type StepId = "scan" | "manual" | "photo" | "photoReview" | "confirm" | "done";
type AttendanceCredential = {
  purpose: AttendancePurpose;
  token?: string;
  manualCode?: string;
};
type ApiError = Error & {
  response?: { status: number; data?: { code?: string; detail?: string } };
};

async function captureBlob(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Camera capture is not available");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to capture photo"));
    }, "image/webp", 0.9);
  });
}

function getApiErrorCode(error: unknown): string {
  return (error as ApiError).response?.data?.code || "";
}

function getAttendanceSubmitErrorMessage(
  error: unknown,
  tr: AttendanceTranslate,
  purpose?: string,
): string {
  const code = getApiErrorCode(error);
  if (code === "checkout_not_available_until_submitted") {
    return tr("attendance.errors.checkoutAfterSubmit", "交卷後才可以簽退。");
  }
  if (code === "check_in_only_before_personal_start") {
    return purpose === "check_in"
      ? tr(
          "attendance.errors.checkInOnlyBeforeStart",
          "您已開始或完成考試，不能再補簽到；若要離場請掃描簽退 QR Code。",
        )
      : tr("attendance.errors.notCheckInTime", "目前不在可簽到時間。");
  }
  if (code === "attendance_token_expired") {
    return tr(
      "attendance.errors.tokenExpired",
      "QR Code 已過期，請重新掃描投影畫面上的 QR Code。",
    );
  }
  if (code === "invalid_attendance_token") {
    return tr(
      "attendance.errors.invalidToken",
      "QR Code 無效，請重新掃描投影畫面上的 QR Code。",
    );
  }
  if (code === "invalid_attendance_manual_code") {
    return tr(
      "attendance.errors.invalidManualCode",
      "代碼無效或已過期，請重新輸入投影畫面上的最新代碼。",
    );
  }
  if (code === "attendance_not_enabled") {
    return tr(
      "attendance.errors.notEnabled",
      "此考試尚未開啟 QR Code 簽到簽退。",
    );
  }
  return error instanceof Error
    ? error.message
    : tr("attendance.errors.submitFailed", "Attendance submit failed");
}

function getPurposeLabel(
  tr: AttendanceTranslate,
  purpose?: AttendancePurpose | null,
): string {
  if (purpose === "check_out") {
    return tr("attendance.purpose.checkOut", "簽退");
  }
  return tr("attendance.purpose.checkIn", "簽到");
}

function parseExpectedPurpose(value: string | null): AttendancePurpose | null {
  if (value === "check_in" || value === "check_out") return value;
  return null;
}

function normalizeManualCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

function formatManualCodeInput(value: string): string {
  return normalizeManualCode(value);
}

function formatTime(value: number | null, locale: string): string {
  if (!value) return "--";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

const STEP_MOTION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.22, ease: [0.4, 0.14, 0.3, 1] as const },
};

export default function StudentAttendanceScanScreen() {
  const { t, i18n } = useTranslation("contest");
  const { classroomId, contestId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedPurpose = parseExpectedPurpose(searchParams.get("purpose"));
  const tr = useCallback<AttendanceTranslate>(
    (key, defaultValue, values) => {
      const translated = values
        ? t(key, { defaultValue, ...values })
        : t(key, defaultValue);
      if (typeof translated === "string") return translated;
      return defaultValue.replace(/{{(\w+)}}/g, (_, name) =>
        String(values?.[name] ?? ""),
      );
    },
    [t],
  );

  const [expectedPurpose, setExpectedPurpose] = useState<AttendancePurpose | null>(requestedPurpose);
  const [state, setState] = useState<ScanState>("scanning");
  const [scan, setScan] = useState<AttendanceCredential | null>(null);
  const [pendingScan, setPendingScan] = useState<AttendanceCredential | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [photoPolicy, setPhotoPolicy] = useState<AttendancePhotoPolicy>("room");
  const [contestTitle, setContestTitle] = useState<string>("");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoUrls, setPhotoUrls] = useState<Partial<Record<AttendancePhotoKind, string>>>({});
  const [photoBlobs, setPhotoBlobs] = useState<Partial<Record<AttendancePhotoKind, Blob>>>({});
  const [frozenScanUrl, setFrozenScanUrl] = useState("");
  const [reviewPhotoKind, setReviewPhotoKind] = useState<AttendancePhotoKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);

  const photoUrlsRef = useRef(photoUrls);
  const frozenScanUrlRef = useRef(frozenScanUrl);
  const haptics = useHaptics();

  const photoRequirements = useMemo(
    () => getPhotoRequirementsByPolicy(tr)[photoPolicy],
    [photoPolicy, tr],
  );
  const currentPhoto = photoRequirements[Math.min(photoIndex, photoRequirements.length - 1)];
  const reviewPhotoRequirement = photoRequirements.find((r) => r.id === reviewPhotoKind) || null;
  const allPhotosCaptured = photoRequirements.every((r) => !!photoBlobs[r.id]);
  const reviewPhotoUrl = reviewPhotoRequirement ? photoUrls[reviewPhotoRequirement.id] : "";
  const completedPhotoCount = photoRequirements.filter((r) => !!photoBlobs[r.id]).length;
  const nextPhotoIndex = reviewPhotoRequirement
    ? photoRequirements.findIndex((r) => r.id === reviewPhotoRequirement.id) + 1
    : -1;
  const hasNextPhoto = nextPhotoIndex > 0 && nextPhotoIndex < photoRequirements.length;

  const activeStep: StepId = (() => {
    if (state === "done") return "done";
    if (manualMode) return "manual";
    if (!scan) return "scan";
    if (reviewPhotoRequirement) return "photoReview";
    if (allPhotosCaptured) return "confirm";
    return "photo";
  })();

  const activePurpose = scan?.purpose || pendingScan?.purpose || expectedPurpose;
  const purposeLabel = getPurposeLabel(tr, activePurpose);
  const returnPath = `/classrooms/${classroomId}/contest/${contestId}`;

  const cameraFacingMode: VideoFacingModeEnum =
    activeStep === "photo" ? currentPhoto.facingMode : "environment";
  const scanValidating = activeStep === "scan" && state === "validating";
  const cameraActive =
    (activeStep === "scan" && !scanValidating) || activeStep === "photo";

  const camera = useCameraStream({
    active: cameraActive,
    facingMode: cameraFacingMode,
    messages: {
      unsupported: t(
        "attendance.errors.cameraUnsupported",
        "此瀏覽器不支援相機存取，請改由教師協助簽到。",
      ),
      unavailable: t("attendance.errors.cameraUnavailable", "Camera is not available"),
    },
  });
  const { videoRef, setVideoElement, streamRef, cameraState, cameraError } = camera;

  const handleQrDetected = useCallback(
    (raw: string) => {
      const parsed = raw ? parseAttendanceQrValue(raw) : null;
      if (!parsed) return;
      const freezeFrame = () => {
        const video = videoRef.current;
        if (!video) return;
        void captureBlob(video).then((blob) => {
          const url = URL.createObjectURL(blob);
          setFrozenScanUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }).catch(() => undefined);
      };

      if (expectedPurpose && parsed.purpose !== expectedPurpose) {
        haptics("error");
        setError(
          tr("attendance.errors.wrongPurposeQr", "這是{{actual}} QR Code，請掃描{{expected}} QR Code。", {
            actual: getPurposeLabel(tr, parsed.purpose),
            expected: getPurposeLabel(tr, expectedPurpose),
          }),
        );
        freezeFrame();
        return;
      }
      haptics("scan-success");
      setExpectedPurpose((prev) => prev || parsed.purpose);
      setPendingScan(parsed);
      setState("validating");
      setScannedAt(Date.now());
      setError(null);
      freezeFrame();
      camera.stopStream();
    },
    [camera, expectedPurpose, haptics, tr, videoRef]
  );

  useQrScanner({
    videoRef,
    active:
      activeStep === "scan" &&
      cameraState === "ready" &&
      state === "scanning" &&
      !scan &&
      !error,
    onDetected: handleQrDetected,
  });

  useEffect(() => {
    if (!contestId) return;
    let cancelled = false;
    void getContest(contestId).then((contest) => {
      if (cancelled || !contest) return;
      setPhotoPolicy(contest.attendancePhotoPolicy || "room");
      setContestTitle(contest.title || "");
      if (!requestedPurpose) {
        if (contest.attendanceStatus?.canCheckOut) setExpectedPurpose("check_out");
        else if (contest.attendanceStatus?.canCheckIn) setExpectedPurpose("check_in");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [contestId, requestedPurpose]);

  useEffect(() => {
    photoUrlsRef.current = photoUrls;
  }, [photoUrls]);

  useEffect(() => {
    frozenScanUrlRef.current = frozenScanUrl;
  }, [frozenScanUrl]);

  useEffect(() => {
    if (!scan || allPhotosCaptured) return;
    if (reviewPhotoRequirement) return;
    const nextMissing = photoRequirements.findIndex((r) => !photoBlobs[r.id]);
    if (nextMissing >= 0 && nextMissing !== photoIndex) setPhotoIndex(nextMissing);
  }, [allPhotosCaptured, photoBlobs, photoIndex, photoRequirements, reviewPhotoRequirement, scan]);

  useEffect(() => {
    if (state !== "validating" || !pendingScan) return undefined;
    const timer = window.setTimeout(() => {
      setScan(pendingScan);
      setPendingScan(null);
      setState("capturing");
    }, 650);
    return () => window.clearTimeout(timer);
  }, [pendingScan, state]);

  useEffect(() => {
    return () => {
      Object.values(photoUrlsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      if (frozenScanUrlRef.current) URL.revokeObjectURL(frozenScanUrlRef.current);
    };
  }, []);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      setSubmitError(null);
      const blob = await captureBlob(videoRef.current);
      haptics("shutter");
      const existingUrl = photoUrls[currentPhoto.id];
      if (existingUrl) URL.revokeObjectURL(existingUrl);
      setPhotoBlobs((prev) => ({ ...prev, [currentPhoto.id]: blob }));
      setPhotoUrls((prev) => ({ ...prev, [currentPhoto.id]: URL.createObjectURL(blob) }));
      setReviewPhotoKind(currentPhoto.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("attendance.errors.capturePhotoFailed", "Failed to capture photo"),
      );
    }
  }, [currentPhoto.id, haptics, photoUrls, t, videoRef]);

  const handleAcceptPhoto = useCallback(() => {
    if (!reviewPhotoRequirement) return;
    setSubmitError(null);
    const acceptedIndex = photoRequirements.findIndex((r) => r.id === reviewPhotoRequirement.id);
    setReviewPhotoKind(null);
    if (acceptedIndex >= 0 && acceptedIndex < photoRequirements.length - 1) {
      setPhotoIndex(acceptedIndex + 1);
      setState("capturing");
    }
  }, [photoRequirements, reviewPhotoRequirement]);

  const handleRetake = useCallback(() => {
    let lastCaptured = reviewPhotoRequirement
      ? photoRequirements.findIndex((r) => r.id === reviewPhotoRequirement.id)
      : 0;
    if (lastCaptured < 0) lastCaptured = 0;
    if (!reviewPhotoRequirement) {
      photoRequirements.forEach((r, i) => {
        if (photoBlobs[r.id]) lastCaptured = i;
      });
    }
    const requirement = photoRequirements[lastCaptured];
    const existingUrl = photoUrls[requirement.id];
    if (existingUrl) URL.revokeObjectURL(existingUrl);
    setPhotoBlobs((prev) => {
      const next = { ...prev };
      delete next[requirement.id];
      return next;
    });
    setPhotoUrls((prev) => {
      const next = { ...prev };
      delete next[requirement.id];
      return next;
    });
    setPhotoIndex(lastCaptured);
    setReviewPhotoKind(null);
    setState("capturing");
  }, [photoBlobs, photoRequirements, photoUrls, reviewPhotoRequirement]);

  const handleRescan = useCallback(() => {
    Object.values(photoUrls).forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
    setScan(null);
    setPendingScan(null);
    setScannedAt(null);
    setPhotoBlobs({});
    setPhotoUrls({});
    setPhotoIndex(0);
    setReviewPhotoKind(null);
    setManualMode(false);
    setManualCode("");
    setFrozenScanUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
    setState("scanning");
    setError(null);
    setSubmitError(null);
  }, [photoUrls]);

  const handleManualToggle = useCallback(() => {
    camera.stopStream();
    setManualMode(true);
    setError(null);
  }, [camera]);

  const handleManualBack = useCallback(() => {
    setManualMode(false);
    setManualCode("");
    setError(null);
  }, []);

  const handleManualSubmit = useCallback(() => {
    const normalized = normalizeManualCode(manualCode);
    if (!expectedPurpose) {
      setError(t("attendance.errors.missingPurpose", "請先從競賽主頁選擇簽到或簽退。"));
      return;
    }
    if (normalized.length !== 8) {
      setError(t("attendance.errors.manualCodeLength", "請輸入投影畫面上的 8 碼代碼。"));
      return;
    }
    setPendingScan({ purpose: expectedPurpose, manualCode: normalized });
    setState("validating");
    setScannedAt(Date.now());
    setManualMode(false);
    setError(null);
  }, [expectedPurpose, manualCode, t]);

  const handleSubmit = useCallback(async () => {
    if (!contestId || !scan || !allPhotosCaptured) return;
    setState("submitting");
    setSubmitError(null);
    try {
      const captured = photoRequirements.map((requirement, index) => ({
        requirement,
        blob: photoBlobs[requirement.id],
        seq: index + 1,
      }));
      const missing = captured.find((p) => !p.blob);
      if (missing) {
        throw new Error(
          tr("attendance.errors.photoMissing", "{{label}}尚未拍攝完成", {
            label: missing.requirement.label,
          }),
        );
      }
      const event = await createAttendanceEvent(contestId, {
        mode: "student_self_scan",
        purpose: scan.purpose,
        token: scan.token,
        manualCode: scan.manualCode,
        client_observed_at_ms: Date.now(),
        device_kind: "mobile",
      });
      const capturedAt = Date.now();
      const intent = await createEvidenceUploadIntent(contestId, {
        event_id: event.event_id,
        evidence_cluster_id: event.evidence_cluster_id,
        source_module: "attendance",
        evidence_mode: "audit",
        frames: captured.map((p) => ({ client_captured_at_ms: capturedAt, seq: p.seq })),
      });
      if (intent.items.length !== captured.length) {
        throw new Error(
          t(
            "attendance.errors.uploadIntentIncomplete",
            "Upload intent did not include all required photos",
          ),
        );
      }
      const confirmed = [];
      for (let i = 0; i < intent.items.length; i += 1) {
        const item = intent.items[i];
        const photo = captured[i];
        if (!item || !photo?.blob) continue;
        const response = await fetch(item.put_url, {
          method: "PUT",
          headers: item.required_headers || { "Content-Type": "image/webp" },
          body: photo.blob,
        });
        if (!response.ok) {
          throw new Error(t("attendance.errors.photoUploadFailed", "Photo upload failed"));
        }
        confirmed.push({
          evidence_frame_id: item.evidence_frame_id,
          object_key: item.object_key,
          byte_size: photo.blob.size,
        });
      }
      await confirmEvidenceUpload(contestId, {
        event_id: event.event_id,
        upload_session_id: intent.upload_session_id,
        frames: confirmed,
      });
      camera.stopStream();
      streamRef.current = null;
      haptics("submit-success");
      setState("done");
    } catch (err) {
      haptics("error");
      setState("capturing");
      setSubmitError(getAttendanceSubmitErrorMessage(err, tr, scan?.purpose));
    }
  }, [allPhotosCaptured, camera, contestId, haptics, photoBlobs, photoRequirements, scan, streamRef, t, tr]);

  const scanDisplayError =
    error || (activeStep === "scan" && cameraState === "unavailable" ? cameraError : null);
  const photoDisplayError =
    error || (activeStep === "photo" && cameraState === "unavailable" ? cameraError : null);

  // Compute frame hint
  const scanHintStatus: FrameHintStatus = scanValidating
    ? "validating"
    : scanDisplayError
      ? "error"
      : cameraState === "unavailable"
        ? "photoUnavailable"
        : cameraState === "requesting"
          ? "idle"
          : "idle";
  const photoHintStatus: FrameHintStatus = cameraState === "unavailable"
    ? "photoUnavailable"
    : cameraState === "ready"
      ? "photoReady"
      : "idle";

  const scanHintText = scanValidating
    ? t("attendance.scan.validating", "驗證中…")
    : cameraState === "requesting"
      ? t("attendance.scan.waitingCamera", "等待相機授權")
      : cameraState === "ready"
        ? t("attendance.scan.alignQr", "對準投影上的 QR Code")
        : undefined;

  const photoHintText = cameraState === "unavailable"
    ? t("attendance.photo.cameraUnavailable", "相機無法使用")
    : cameraState === "requesting"
      ? t("attendance.scan.waitingCamera", "等待相機授權")
      : t("attendance.photo.alignTarget", "對準{{label}}", {
          label: currentPhoto.label,
        });

  // Build CTA
  const ctaInput: AttendanceCtaInput = {
    step: activeStep === "done" ? "done" : activeStep,
    cameraState,
    scanState: scanValidating ? "validating" : scanDisplayError ? "error" : "idle",
    purpose: activePurpose ?? null,
    manualReady: normalizeManualCode(manualCode).length === 6,
    hasNextPhoto,
    uploading: state === "submitting",
    uploadFailed: !!submitError && state !== "submitting",
  };
  const primaryCta = getPrimaryCta(ctaInput, tr);
  const secondaryCta = getSecondaryCta(ctaInput, tr);

  const handlePrimary = useCallback(() => {
    switch (activeStep) {
      case "scan":
        if (cameraState === "unavailable") {
          setState("scanning");
          setError(null);
          setFrozenScanUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return "";
          });
          return;
        }
        if (error) {
          setError(null);
          setFrozenScanUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return "";
          });
          return;
        }
        return;
      case "manual":
        handleManualSubmit();
        return;
      case "photo":
        void handleCapture();
        return;
      case "photoReview":
        handleAcceptPhoto();
        return;
      case "confirm":
        void handleSubmit();
        return;
      case "done":
        navigate(returnPath);
        return;
      default:
        return;
    }
  }, [activeStep, cameraState, error, handleAcceptPhoto, handleCapture, handleManualSubmit, handleSubmit, navigate, returnPath]);

  const handleSecondary = useCallback(() => {
    if (!secondaryCta) return;
    switch (secondaryCta.action) {
      case "manual":
        handleManualToggle();
        return;
      case "backToCamera":
        handleManualBack();
        return;
      case "retake":
        handleRetake();
        return;
      case "rescan":
      case "rescanFromConfirm":
        handleRescan();
        return;
      case "retakeFromConfirm":
        handleRetake();
        return;
      default:
        return;
    }
  }, [handleManualBack, handleManualToggle, handleRescan, handleRetake, secondaryCta]);

  const headerTitle = useMemo(() => {
    if (activeStep === "done") {
      return t("attendance.header.done", "{{purpose}}完成", { purpose: purposeLabel });
    }
    if (activeStep === "manual") {
      return t("attendance.header.manual", "輸入{{purpose}}代碼", { purpose: purposeLabel });
    }
    if (activeStep === "photo" || activeStep === "photoReview") {
      return t("attendance.header.photo", "拍照{{purpose}}", { purpose: purposeLabel });
    }
    if (activeStep === "confirm") {
      return t("attendance.header.confirm", "確認{{purpose}}", { purpose: purposeLabel });
    }
    return t("attendance.header.auth", "{{purpose}}認證", { purpose: purposeLabel });
  }, [activeStep, purposeLabel, t]);

  // Render content slot
  const renderContent = () => {
    if (activeStep === "scan") {
      return (
        <ScanContent
          title={t("attendance.scan.title", "掃描 QR Code")}
          description={t(
            "attendance.scan.description",
            "請對準投影畫面上的{{purpose}} QR Code。",
            { purpose: purposeLabel },
          )}
          hint={scanHintStatus}
          hintText={scanHintText}
          videoRef={setVideoElement}
          showVideo={cameraActive && !scanValidating && !error}
          frozenScanUrl={scanValidating || error ? frozenScanUrl : undefined}
          error={scanDisplayError}
        />
      );
    }
    if (activeStep === "manual") {
      return (
        <ManualCodeContent
          purposeLabel={purposeLabel}
          value={manualCode}
          onChange={(v) => setManualCode(formatManualCodeInput(v))}
          error={error}
        />
      );
    }
    if (activeStep === "photo") {
      return (
        <PhotoContent
          title={currentPhoto.title}
          description={currentPhoto.description}
          hint={photoHintStatus}
          hintText={photoHintText}
          videoRef={setVideoElement}
          showVideo={cameraActive}
          contestChipLabel={
            scan && contestTitle
              ? t("attendance.photo.qrVerifiedChip", "QR 已認證 · {{contest}}", {
                  contest: contestTitle,
                })
              : undefined
          }
          error={photoDisplayError}
        />
      );
    }
    if (activeStep === "photoReview" && reviewPhotoRequirement && reviewPhotoUrl) {
      return (
        <PhotoContent
          title={reviewPhotoRequirement.title}
          description={hasNextPhoto
            ? t("attendance.photo.nextStepPhoto", "下一步：{{title}}", {
                title: photoRequirements[nextPhotoIndex].title,
              })
            : t("attendance.photo.nextStepConfirm", "下一步：確認簽到資訊並上傳")}
          hint="photoReady"
          videoRef={setVideoElement}
          showVideo={false}
          reviewUrl={reviewPhotoUrl}
          contestChipLabel={contestTitle
            ? t("attendance.photo.readyChip", "照片已就緒 · {{contest}}", {
                contest: contestTitle,
              })
            : undefined}
        />
      );
    }
    if (activeStep === "confirm") {
      return (
        <ConfirmContent
          purposeLabel={purposeLabel}
          scannedAtLabel={formatTime(scannedAt, i18n.language)}
          photoCountLabel={`${completedPhotoCount}/${photoRequirements.length}`}
          requirements={photoRequirements}
          photoUrls={photoUrls}
          uploadError={submitError}
        />
      );
    }
    if (activeStep === "done") {
      return (
        <DoneContent
          purposeLabel={purposeLabel}
          contestTitle={contestTitle}
          scannedAtLabel={formatTime(scannedAt, i18n.language)}
          requirements={photoRequirements}
          photoUrls={photoUrls}
        />
      );
    }
    return null;
  };

  // Render footer slot
  const renderFooter = () => {
    if (activeStep === "photo") {
      return (
        <ShutterRow
          onShutter={handleCapture}
          shutterDisabled={!scan || cameraState !== "ready"}
          shutterLabel={t("attendance.photo.captureLabel", "拍攝{{label}}", {
            label: currentPhoto.label,
          })}
        />
      );
    }
    return (
      <DynamicFooter
        primary={primaryCta}
        secondary={secondaryCta}
        onPrimary={handlePrimary}
        onSecondary={handleSecondary}
      />
    );
  };

  return (
    <AttendanceShell
      title={headerTitle}
      onBack={() => navigate(returnPath)}
      content={
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeStep}
            initial={STEP_MOTION.initial}
            animate={STEP_MOTION.animate}
            exit={STEP_MOTION.exit}
            transition={STEP_MOTION.transition}
            style={{ display: "grid", height: "100%", minHeight: 0 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      }
      footer={
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeStep === "photo" ? "shutter" : "dynamic"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {renderFooter()}
          </motion.div>
        </AnimatePresence>
      }
    />
  );
}
