import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import type { AttendancePhotoPolicy, AttendancePurpose } from "@/core/entities/contest.entity";
import { parseAttendanceQrValue } from "@/features/contest/attendance/attendanceQr";
import { getAttendanceErrorMessage } from "@/features/contest/attendance/attendanceErrorMessages";
import { validateAttendanceCredential } from "@/infrastructure/api/repositories/attendance.repository";
import { getContest } from "@/infrastructure/api/repositories/contest.repository";

import { AttendanceShell } from "./components/AttendanceShell";
import { ConfirmContent } from "./components/ConfirmContent";
import { DoneContent } from "./components/DoneContent";
import { DynamicFooter } from "./components/DynamicFooter";
import { ManualCodeContent } from "./components/ManualCodeContent";
import { PhotoContent } from "./components/PhotoContent";
import { ScanContent } from "./components/ScanContent";
import { ShutterRow } from "./components/ShutterRow";
import { useAttendancePhotos } from "./hooks/useAttendancePhotos";
import { useAttendanceSubmit } from "./hooks/useAttendanceSubmit";
import { useCameraStream } from "./hooks/useCameraStream";
import { useHaptics } from "./hooks/useHaptics";
import { useQrScanner } from "./hooks/useQrScanner";
import {
  type AttendanceCtaInput,
  getPrimaryCta,
  getSecondaryCta,
} from "./lib/attendanceCta";
import { deriveAttendanceStep } from "./lib/deriveAttendanceStep";
import { type FrameHintStatus } from "./lib/frameHint";
import { type AttendanceTranslate } from "./lib/photoRequirements";

type AttendanceCredential = {
  purpose: AttendancePurpose;
  token?: string;
  manualCode?: string;
};

function captureFrameToBlob(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("camera_capture_unavailable");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("photo_capture_failed"));
    }, "image/webp", 0.9);
  });
}

function getPurposeLabel(
  tr: AttendanceTranslate,
  purpose?: AttendancePurpose | null,
): string {
  if (purpose === "check_out") return tr("attendance.purpose.checkOut", "簽退");
  return tr("attendance.purpose.checkIn", "簽到");
}

function parseExpectedPurpose(value: string | null): AttendancePurpose | null {
  if (value === "check_in" || value === "check_out") return value;
  return null;
}

function normalizeManualCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
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
  const [scan, setScan] = useState<AttendanceCredential | null>(null);
  const [pendingScan, setPendingScan] = useState<AttendanceCredential | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [photoPolicy, setPhotoPolicy] = useState<AttendancePhotoPolicy>("room");
  const [contestTitle, setContestTitle] = useState<string>("");
  const [frozenScanUrl, setFrozenScanUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);

  const frozenScanUrlRef = useRef(frozenScanUrl);
  useEffect(() => {
    frozenScanUrlRef.current = frozenScanUrl;
  }, [frozenScanUrl]);
  useEffect(() => {
    return () => {
      if (frozenScanUrlRef.current) URL.revokeObjectURL(frozenScanUrlRef.current);
    };
  }, []);

  const haptics = useHaptics();

  const photos = useAttendancePhotos({ tr, photoPolicy, hasScan: !!scan });

  const activeStep = deriveAttendanceStep({
    isDone: false,
    manualMode,
    hasScan: !!scan,
    hasReviewPhoto: !!photos.reviewPhotoRequirement,
    allPhotosCaptured: photos.allPhotosCaptured,
  });

  const cameraFacingMode: VideoFacingModeEnum =
    activeStep === "photo" ? photos.currentPhoto.facingMode : "environment";
  const cameraActive =
    (activeStep === "scan" && !isValidating) || activeStep === "photo";

  const camera = useCameraStream({
    active: cameraActive,
    facingMode: cameraFacingMode,
    messages: {
      unsupported: t(
        "attendance.errors.cameraUnsupported",
        "此瀏覽器不支援相機存取，請改由教師協助簽到。",
      ),
      unavailable: t("attendance.errors.cameraUnavailable", "相機無法使用"),
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
        void captureFrameToBlob(video).then((blob) => {
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
      setIsValidating(true);
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
      !isValidating &&
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
      setContestTitle(contest.name || "");
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
    if (!isValidating || !pendingScan) return undefined;
    if (!contestId) return undefined;
    const credential = pendingScan;
    const wasManual = !!credential.manualCode;
    let cancelled = false;
    (async () => {
      try {
        await validateAttendanceCredential(contestId, {
          purpose: credential.purpose,
          token: credential.token,
          manualCode: credential.manualCode,
        });
        if (cancelled) return;
        setScan(credential);
        setPendingScan(null);
        setIsValidating(false);
      } catch (err) {
        if (cancelled) return;
        haptics("error");
        const errorMessage = getAttendanceErrorMessage(err, tr, credential.purpose);
        setError(errorMessage);
        setPendingScan(null);
        setIsValidating(false);
        if (wasManual) setManualMode(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contestId, haptics, isValidating, pendingScan, tr]);

  const submit = useAttendanceSubmit({
    contestId,
    tr,
    haptics,
    onSuccess: useCallback(() => {
      camera.stopStream();
      streamRef.current = null;
    }, [camera, streamRef]),
  });

  const handleCapture = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      submit.clearSubmitError();
      const blob = await captureFrameToBlob(videoRef.current);
      haptics("shutter");
      photos.applyCapture(blob);
    } catch {
      setError(t("attendance.errors.capturePhotoFailed", "照片擷取失敗，請重新拍攝。"));
    }
  }, [haptics, photos, submit, t, videoRef]);

  const handleAcceptPhoto = useCallback(() => {
    submit.clearSubmitError();
    photos.acceptPhoto();
  }, [photos, submit]);

  const handleRetake = useCallback(() => {
    submit.clearSubmitError();
    photos.retakePhoto();
  }, [photos, submit]);

  const handleRescan = useCallback(() => {
    photos.reset();
    setScan(null);
    setPendingScan(null);
    setIsValidating(false);
    setScannedAt(null);
    setManualMode(false);
    setManualCode("");
    setFrozenScanUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
    setError(null);
    submit.reset();
  }, [photos, submit]);

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
    if (normalized.length !== 6) {
      setError(t("attendance.errors.manualCodeLength", "請輸入投影畫面上的 6 碼代碼。"));
      return;
    }
    setPendingScan({ purpose: expectedPurpose, manualCode: normalized });
    setIsValidating(true);
    setScannedAt(Date.now());
    setManualMode(false);
    setError(null);
  }, [expectedPurpose, manualCode, t]);

  const handleSubmit = useCallback(() => {
    if (!scan || !photos.allPhotosCaptured) return;
    void submit.submit({
      scan,
      photoRequirements: photos.photoRequirements,
      photoBlobs: photos.photoBlobs,
    });
  }, [photos.allPhotosCaptured, photos.photoBlobs, photos.photoRequirements, scan, submit]);

  const activePurpose = scan?.purpose || pendingScan?.purpose || expectedPurpose;
  const purposeLabel = getPurposeLabel(tr, activePurpose);
  const returnPath = `/classrooms/${classroomId}/contest/${contestId}`;
  const displayStep = submit.isDone ? "done" : activeStep;

  const scanDisplayError =
    error ||
    (activeStep === "scan" && cameraState === "unavailable" ? cameraError : null);
  const photoDisplayError =
    error ||
    (activeStep === "photo" && cameraState === "unavailable" ? cameraError : null);

  const scanHintStatus: FrameHintStatus = isValidating
    ? "validating"
    : scanDisplayError
      ? "error"
      : cameraState === "unavailable"
        ? "photoUnavailable"
        : "idle";
  const photoHintStatus: FrameHintStatus =
    cameraState === "unavailable"
      ? "photoUnavailable"
      : cameraState === "ready"
        ? "photoReady"
        : "idle";

  const scanHintText = isValidating
    ? t("attendance.scan.validating", "驗證中…")
    : cameraState === "requesting"
      ? t("attendance.scan.waitingCamera", "等待相機授權")
      : cameraState === "ready"
        ? t("attendance.scan.alignQr", "對準投影上的 QR Code")
        : undefined;

  const photoHintText =
    cameraState === "unavailable"
      ? t("attendance.photo.cameraUnavailable", "相機無法使用")
      : cameraState === "requesting"
        ? t("attendance.scan.waitingCamera", "等待相機授權")
        : t("attendance.photo.alignTarget", "對準{{label}}", {
            label: photos.currentPhoto.label,
          });

  const ctaInput: AttendanceCtaInput = {
    step: displayStep,
    cameraState,
    scanState: isValidating ? "validating" : scanDisplayError ? "error" : "idle",
    purpose: activePurpose ?? null,
    manualReady: normalizeManualCode(manualCode).length === 6,
    hasNextPhoto: photos.hasNextPhoto,
    uploading: submit.isSubmitting,
    uploadFailed: !!submit.submitError && !submit.isSubmitting,
  };
  const primaryCta = getPrimaryCta(ctaInput, tr);
  const secondaryCta = getSecondaryCta(ctaInput, tr);

  const handlePrimary = useCallback(() => {
    switch (displayStep) {
      case "scan":
        if (cameraState === "unavailable" || error) {
          setError(null);
          setFrozenScanUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return "";
          });
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
        handleSubmit();
        return;
      case "done":
        navigate(returnPath);
        return;
    }
  }, [
    cameraState,
    displayStep,
    error,
    handleAcceptPhoto,
    handleCapture,
    handleManualSubmit,
    handleSubmit,
    navigate,
    returnPath,
  ]);

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
      case "retakeFromConfirm":
        handleRetake();
        return;
      case "rescan":
      case "rescanFromConfirm":
        handleRescan();
        return;
    }
  }, [handleManualBack, handleManualToggle, handleRescan, handleRetake, secondaryCta]);

  const headerTitle = useMemo(() => {
    if (displayStep === "done") {
      return t("attendance.header.done", "{{purpose}}完成", { purpose: purposeLabel });
    }
    if (displayStep === "manual") {
      return t("attendance.header.manual", "輸入{{purpose}}代碼", { purpose: purposeLabel });
    }
    if (displayStep === "photo" || displayStep === "photoReview") {
      return t("attendance.header.photo", "拍照{{purpose}}", { purpose: purposeLabel });
    }
    if (displayStep === "confirm") {
      return t("attendance.header.confirm", "確認{{purpose}}", { purpose: purposeLabel });
    }
    return t("attendance.header.auth", "{{purpose}}認證", { purpose: purposeLabel });
  }, [displayStep, purposeLabel, t]);

  const renderContent = () => {
    if (displayStep === "scan") {
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
          showVideo={cameraActive && !isValidating && !error}
          frozenScanUrl={isValidating || error ? frozenScanUrl : undefined}
          error={scanDisplayError}
        />
      );
    }
    if (displayStep === "manual") {
      return (
        <ManualCodeContent
          purposeLabel={purposeLabel}
          value={manualCode}
          onChange={(v) => setManualCode(normalizeManualCode(v))}
          error={error}
        />
      );
    }
    if (displayStep === "photo") {
      return (
        <PhotoContent
          title={photos.currentPhoto.title}
          description={photos.currentPhoto.description}
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
    if (displayStep === "photoReview" && photos.reviewPhotoRequirement && photos.reviewPhotoUrl) {
      return (
        <PhotoContent
          title={photos.reviewPhotoRequirement.title}
          description={
            photos.hasNextPhoto
              ? t("attendance.photo.nextStepPhoto", "下一步：{{title}}", {
                  title: photos.photoRequirements[photos.nextPhotoIndex].title,
                })
              : t("attendance.photo.nextStepConfirm", "下一步：確認簽到資訊並上傳")
          }
          hint="photoReady"
          videoRef={setVideoElement}
          showVideo={false}
          reviewUrl={photos.reviewPhotoUrl}
          contestChipLabel={
            contestTitle
              ? t("attendance.photo.readyChip", "照片已就緒 · {{contest}}", {
                  contest: contestTitle,
                })
              : undefined
          }
        />
      );
    }
    if (displayStep === "confirm") {
      return (
        <ConfirmContent
          purposeLabel={purposeLabel}
          scannedAtLabel={formatTime(scannedAt, i18n.language)}
          photoCountLabel={`${photos.completedPhotoCount}/${photos.photoRequirements.length}`}
          requirements={photos.photoRequirements}
          photoUrls={photos.photoUrls}
          uploadError={submit.submitError}
        />
      );
    }
    if (displayStep === "done") {
      return (
        <DoneContent
          purposeLabel={purposeLabel}
          contestTitle={contestTitle}
          scannedAtLabel={formatTime(scannedAt, i18n.language)}
          requirements={photos.photoRequirements}
          photoUrls={photos.photoUrls}
        />
      );
    }
    return null;
  };

  const renderFooter = () => {
    if (displayStep === "photo") {
      return (
        <ShutterRow
          onShutter={handleCapture}
          shutterDisabled={!scan || cameraState !== "ready"}
          shutterLabel={t("attendance.photo.captureLabel", "拍攝{{label}}", {
            label: photos.currentPhoto.label,
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
            key={displayStep}
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
            key={displayStep === "photo" ? "shutter" : "dynamic"}
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
