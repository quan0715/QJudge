import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckmarkFilled, ChevronLeft, QrCode, Renew, SendAlt } from "@carbon/icons-react";
import { Button, InlineNotification, TextInput } from "@carbon/react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import jsQR from "jsqr";

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
import styles from "./StudentAttendanceScanScreen.module.scss";

type ScanState = "scanning" | "validating" | "capturing" | "submitting" | "done";
type CameraState = "requesting" | "ready" | "unavailable";
type ScannerMode = "waiting" | "native" | "js";
type StepId = "scan" | "photo" | "photoReview" | "confirm";
type AttendanceCredential = {
  purpose: AttendancePurpose;
  token?: string;
  manualCode?: string;
};
type AttendancePhotoRequirement = {
  id: AttendancePhotoKind;
  label: string;
  title: string;
  description: string;
  facingMode: VideoFacingModeEnum;
};
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
};
type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};
type ApiError = Error & {
  status?: number;
  response?: {
    status: number;
    data?: {
      code?: string;
      detail?: string;
    };
  };
};

async function captureBlob(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Camera capture is not available");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to capture photo"));
    }, "image/webp", 0.9);
  });
}

async function requestCameraStream(facingMode: VideoFacingModeEnum): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode } },
      audio: false,
    });
  } catch {
    return navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
  }
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function getApiErrorCode(error: unknown): string {
  return (error as ApiError).response?.data?.code || "";
}

function getAttendanceSubmitErrorMessage(error: unknown, purpose?: string): string {
  const code = getApiErrorCode(error);
  if (code === "checkout_not_available_until_submitted") return "交卷後才可以簽退。";
  if (code === "check_in_only_before_personal_start") {
    return purpose === "check_in"
      ? "您已開始或完成考試，不能再補簽到；若要離場請掃描簽退 QR Code。"
      : "目前不在可簽到時間。";
  }
  if (code === "attendance_token_expired") return "QR Code 已過期，請重新掃描投影畫面上的 QR Code。";
  if (code === "invalid_attendance_token") return "QR Code 無效，請重新掃描投影畫面上的 QR Code。";
  if (code === "invalid_attendance_manual_code") return "代碼無效或已過期，請重新輸入投影畫面上的最新代碼。";
  if (code === "attendance_not_enabled") return "此考試尚未開啟 QR Code 簽到簽退。";
  return error instanceof Error ? error.message : "Attendance submit failed";
}

function getPurposeLabel(purpose?: AttendancePurpose | null): string {
  if (purpose === "check_in") return "簽到";
  if (purpose === "check_out") return "簽退";
  return "簽到簽退";
}

function parseExpectedPurpose(value: string | null): AttendancePurpose | null {
  if (value === "check_in" || value === "check_out") return value;
  return null;
}

function normalizeManualCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function formatManualCodeInput(value: string): string {
  const normalized = normalizeManualCode(value).slice(0, 8);
  return normalized.length > 4
    ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
    : normalized;
}

async function createNativeQrDetector(): Promise<BarcodeDetectorLike | null> {
  const detectorCtor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (!detectorCtor) return null;
  try {
    const supportedFormats =
      typeof detectorCtor.getSupportedFormats === "function"
        ? await detectorCtor.getSupportedFormats()
        : [];
    if (supportedFormats.length > 0 && !supportedFormats.includes("qr_code")) {
      return null;
    }
    return new detectorCtor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

function decodeQrFromVideoFrame(video: HTMLVideoElement): string {
  if (!video.videoWidth || !video.videoHeight) return "";
  const maxWidth = 720;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const width = Math.max(1, Math.floor(video.videoWidth * scale));
  const height = Math.max(1, Math.floor(video.videoHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "";
  context.drawImage(video, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return jsQR(imageData.data, width, height)?.data || "";
}

const PHOTO_REQUIREMENTS_BY_POLICY: Record<AttendancePhotoPolicy, AttendancePhotoRequirement[]> = {
  room: [
    {
      id: "room",
      label: "現場照片",
      title: "拍攝現場照片",
      description: "請拍攝教室環境與考試裝置畫面。",
      facingMode: "environment",
    },
  ],
  room_and_selfie: [
    {
      id: "room",
      label: "現場照片",
      title: "拍攝現場照片",
      description: "請使用後鏡頭拍攝教室環境與考試裝置畫面。",
      facingMode: "environment",
    },
    {
      id: "selfie",
      label: "本人照片",
      title: "拍攝本人到場照片",
      description: "請使用前鏡頭拍攝本人到場照片。",
      facingMode: "user",
    },
  ],
};

function formatTime(value: number | null): string {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default function StudentAttendanceScanScreen() {
  const { classroomId, contestId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestedPurpose = parseExpectedPurpose(searchParams.get("purpose"));
  const [expectedPurpose, setExpectedPurpose] = useState<AttendancePurpose | null>(requestedPurpose);
  const [state, setState] = useState<ScanState>("scanning");
  const [scan, setScan] = useState<AttendanceCredential | null>(null);
  const [pendingScan, setPendingScan] = useState<AttendanceCredential | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [photoPolicy, setPhotoPolicy] = useState<AttendancePhotoPolicy>("room");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoUrls, setPhotoUrls] = useState<Partial<Record<AttendancePhotoKind, string>>>({});
  const [photoBlobs, setPhotoBlobs] = useState<Partial<Record<AttendancePhotoKind, Blob>>>({});
  const [frozenScanUrl, setFrozenScanUrl] = useState("");
  const [reviewPhotoKind, setReviewPhotoKind] = useState<AttendancePhotoKind | null>(null);
  const photoUrlsRef = useRef<Partial<Record<AttendancePhotoKind, string>>>({});
  const frozenScanUrlRef = useRef("");
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("requesting");
  const [scannerMode, setScannerMode] = useState<ScannerMode>("waiting");
  const photoRequirements = PHOTO_REQUIREMENTS_BY_POLICY[photoPolicy];
  const currentPhoto = photoRequirements[Math.min(photoIndex, photoRequirements.length - 1)];
  const reviewPhotoRequirement =
    photoRequirements.find((requirement) => requirement.id === reviewPhotoKind) || null;
  const allPhotosCaptured = photoRequirements.every((requirement) => !!photoBlobs[requirement.id]);
  const reviewPhotoUrl = reviewPhotoRequirement ? photoUrls[reviewPhotoRequirement.id] : "";
  const activeStep: StepId =
    state === "done" || (allPhotosCaptured && !reviewPhotoRequirement)
      ? "confirm"
      : !scan
        ? "scan"
        : reviewPhotoRequirement
            ? "photoReview"
            : "photo";
  const activePurpose = scan?.purpose || pendingScan?.purpose;
  const purposeLabel = getPurposeLabel(activePurpose || expectedPurpose);
  const returnPath = `/classrooms/${classroomId}/contest/${contestId}`;
  const cameraFacingMode = activeStep === "photo" ? currentPhoto.facingMode : "environment";
  const completedPhotoCount = photoRequirements.filter((requirement) => !!photoBlobs[requirement.id]).length;
  const scanValidating = activeStep === "scan" && state === "validating";
  const cameraActive = ((activeStep === "scan" && !scanValidating && !manualMode) || activeStep === "photo");
  const nextPhotoIndex = reviewPhotoRequirement
    ? photoRequirements.findIndex((requirement) => requirement.id === reviewPhotoRequirement.id) + 1
    : -1;
  const nextPhoto = nextPhotoIndex > 0 ? photoRequirements[nextPhotoIndex] : null;
  const totalFlowSteps = photoRequirements.length + 2;
  const currentFlowStep =
    activeStep === "scan"
      ? 1
      : activeStep === "confirm"
        ? totalFlowSteps
        : Math.min(totalFlowSteps - 1, photoIndex + 2);
  const stageTitle =
    state === "done"
      ? "佐證已提交"
      : activeStep === "scan"
        ? scanValidating ? "正在驗證 QR Code" : "掃描 QR Code"
        : activeStep === "photo"
          ? currentPhoto.title
          : activeStep === "photoReview"
            ? reviewPhotoRequirement?.title || "確認照片"
          : `確認${purposeLabel}資訊`;
  const stageDescription =
    state === "done"
      ? "系統已記錄您的簽到簽退事件。"
      : activeStep === "scan"
        ? scanValidating
          ? "請稍候，系統正在讀取並驗證 QR Code。"
          : `請對準教師投屏上的${purposeLabel} QR Code。`
        : activeStep === "photo"
          ? currentPhoto.description
          : activeStep === "photoReview"
            ? nextPhoto
              ? `請確認照片清楚。下一步：${nextPhoto.title}。`
              : "請確認照片清楚。下一步：確認簽到資訊並上傳。"
          : "確認照片清楚後再提交。";
  const navigationTitle =
    state === "done"
      ? `${purposeLabel}完成`
      : activeStep === "scan"
        ? `${purposeLabel}認證`
        : activeStep === "photo" || activeStep === "photoReview"
          ? `拍照${purposeLabel}`
          : `確認${purposeLabel}`;
  const statusLabel =
    cameraState === "requesting"
      ? "等待相機授權"
      : cameraState === "unavailable"
        ? "相機無法使用"
        : activeStep === "scan"
          ? scanValidating ? "驗證中" : scannerMode === "waiting" ? "準備掃描" : "正在掃描"
          : `${completedPhotoCount}/${photoRequirements.length}`;

  useEffect(() => {
    if (!contestId) return;
    let cancelled = false;
    void getContest(contestId).then((contest) => {
      if (cancelled || !contest) return;
      setPhotoPolicy(contest.attendancePhotoPolicy || "room");
      if (!requestedPurpose) {
        if (contest.attendanceStatus?.canCheckOut) {
          setExpectedPurpose("check_out");
        } else if (contest.attendanceStatus?.canCheckIn) {
          setExpectedPurpose("check_in");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [contestId, requestedPurpose]);

  useEffect(() => {
    let cancelled = false;
    let ownedStream: MediaStream | null = null;
    const start = async () => {
      if (!cameraActive) {
        stopMediaStream(streamRef.current);
        streamRef.current = null;
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        setScannerMode("waiting");
        return;
      }
      try {
        setCameraState("requesting");
        setScannerMode("waiting");
        if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
          throw new Error("此瀏覽器不支援相機存取，請改由教師協助簽到。");
        }
        stopMediaStream(streamRef.current);
        streamRef.current = null;
        const stream = await requestCameraStream(cameraFacingMode);
        ownedStream = stream;
        if (cancelled) {
          stopMediaStream(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraState("ready");
        setError(null);
      } catch (err) {
        setCameraState("unavailable");
        setError(err instanceof Error ? err.message : "Camera is not available");
      }
    };
    void start();
    return () => {
      cancelled = true;
      stopMediaStream(ownedStream);
      if (videoRef.current?.srcObject === ownedStream) {
        videoRef.current.srcObject = null;
      }
      if (streamRef.current === ownedStream) {
        streamRef.current = null;
      }
    };
  }, [cameraActive, cameraFacingMode]);

  useEffect(() => {
    photoUrlsRef.current = photoUrls;
  }, [photoUrls]);

  useEffect(() => {
    frozenScanUrlRef.current = frozenScanUrl;
  }, [frozenScanUrl]);

  useEffect(() => {
    if (!scan || allPhotosCaptured) return;
    if (reviewPhotoRequirement) return;
    const nextMissingIndex = photoRequirements.findIndex((requirement) => !photoBlobs[requirement.id]);
    if (nextMissingIndex >= 0 && nextMissingIndex !== photoIndex) {
      setPhotoIndex(nextMissingIndex);
    }
  }, [allPhotosCaptured, photoBlobs, photoIndex, photoRequirements, reviewPhotoRequirement, scan]);

  useEffect(() => {
    if (state !== "done") return undefined;
    const timer = window.setTimeout(() => navigate(returnPath), 2600);
    return () => window.clearTimeout(timer);
  }, [navigate, returnPath, state]);

  useEffect(() => {
    return () => {
      Object.values(photoUrlsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      if (frozenScanUrlRef.current) URL.revokeObjectURL(frozenScanUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (activeStep !== "scan" || cameraState !== "ready" || state !== "scanning" || scan) return;
    let detector: BarcodeDetectorLike | null = null;
    let stopped = false;
    let timer = 0;
    void createNativeQrDetector().then((nextDetector) => {
      if (stopped) return;
      detector = nextDetector;
      setScannerMode(nextDetector ? "native" : "js");
    });
    const tick = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const raw = detector
        ? (await detector.detect(video).catch(() => []))?.[0]?.rawValue
        : decodeQrFromVideoFrame(video);
      const parsed = raw ? parseAttendanceQrValue(raw) : null;
      if (parsed) {
        if (expectedPurpose && parsed.purpose !== expectedPurpose) {
          setError(`這是${getPurposeLabel(parsed.purpose)} QR Code，請掃描${getPurposeLabel(expectedPurpose)} QR Code。`);
          return;
        }
        stopped = true;
        window.clearInterval(timer);
        setScannerMode("waiting");
        setExpectedPurpose((prev) => prev || parsed.purpose);
        setPendingScan(parsed);
        setState("validating");
        setScannedAt(Date.now());
        setError(null);
        void captureBlob(video).then((blob) => {
          const url = URL.createObjectURL(blob);
          setFrozenScanUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }).catch(() => undefined);
        stopMediaStream(streamRef.current);
        streamRef.current = null;
      }
    };
    timer = window.setInterval(() => {
      if (!stopped) void tick();
    }, 500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeStep, cameraState, expectedPurpose, scan, state]);

  useEffect(() => {
    if (state !== "validating" || !pendingScan) return undefined;
    const timer = window.setTimeout(() => {
      setScan(pendingScan);
      setPendingScan(null);
      setState("capturing");
    }, 650);
    return () => window.clearTimeout(timer);
  }, [pendingScan, state]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      setSubmitError(null);
      const blob = await captureBlob(videoRef.current);
      const existingUrl = photoUrls[currentPhoto.id];
      if (existingUrl) URL.revokeObjectURL(existingUrl);
      setPhotoBlobs((prev) => ({ ...prev, [currentPhoto.id]: blob }));
      setPhotoUrls((prev) => ({ ...prev, [currentPhoto.id]: URL.createObjectURL(blob) }));
      setReviewPhotoKind(currentPhoto.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to capture photo");
    }
  }, [currentPhoto.id, photoUrls]);

  const handleUseManualCode = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setManualMode(true);
    setScannerMode("waiting");
    setError(null);
  }, []);

  const handleManualCodeChange = useCallback((value: string) => {
    setManualCode(formatManualCodeInput(value));
    setError(null);
  }, []);

  const handleManualCodeSubmit = useCallback(() => {
    const normalized = normalizeManualCode(manualCode);
    if (!expectedPurpose) {
      setError("請先從競賽主頁選擇簽到或簽退。");
      return;
    }
    if (normalized.length !== 8) {
      setError("請輸入投影畫面上的 8 碼代碼。");
      return;
    }
    setPendingScan({
      purpose: expectedPurpose,
      manualCode: normalized,
    });
    setState("validating");
    setScannedAt(Date.now());
    setError(null);
  }, [expectedPurpose, manualCode]);

  const handleAcceptPhoto = useCallback(() => {
    if (!reviewPhotoRequirement) return;
    setSubmitError(null);
    const acceptedIndex = photoRequirements.findIndex((requirement) => requirement.id === reviewPhotoRequirement.id);
    setReviewPhotoKind(null);
    if (acceptedIndex >= 0 && acceptedIndex < photoRequirements.length - 1) {
      setPhotoIndex(acceptedIndex + 1);
      setState("capturing");
    }
  }, [photoRequirements, reviewPhotoRequirement]);

  const handleRetake = useCallback(() => {
    let lastCapturedIndex = reviewPhotoRequirement
      ? photoRequirements.findIndex((requirement) => requirement.id === reviewPhotoRequirement.id)
      : 0;
    if (lastCapturedIndex < 0) lastCapturedIndex = 0;
    if (!reviewPhotoRequirement) {
      photoRequirements.forEach((requirement, index) => {
        if (photoBlobs[requirement.id]) lastCapturedIndex = index;
      });
    }
    const requirement = photoRequirements[lastCapturedIndex];
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
    setPhotoIndex(lastCapturedIndex);
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

  const handleSubmit = useCallback(async () => {
    if (!contestId || !scan || !allPhotosCaptured) return;
    setState("submitting");
    setSubmitError(null);
    try {
      const capturedPhotos = photoRequirements.map((requirement, index) => ({
        requirement,
        blob: photoBlobs[requirement.id],
        seq: index + 1,
      }));
      const missingPhoto = capturedPhotos.find((photo) => !photo.blob);
      if (missingPhoto) {
        throw new Error(`${missingPhoto.requirement.label}尚未拍攝完成`);
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
        frames: capturedPhotos.map((photo) => ({
          client_captured_at_ms: capturedAt,
          seq: photo.seq,
        })),
      });
      const confirmedFrames = [];
      if (intent.items.length !== capturedPhotos.length) {
        throw new Error("Upload intent did not include all required photos");
      }
      for (let index = 0; index < intent.items.length; index += 1) {
        const item = intent.items[index];
        const photo = capturedPhotos[index];
        if (!item || !photo?.blob) continue;
        const response = await fetch(item.put_url, {
          method: "PUT",
          headers: item.required_headers || { "Content-Type": "image/webp" },
          body: photo.blob,
        });
        if (!response.ok) throw new Error("Photo upload failed");
        confirmedFrames.push({
          evidence_frame_id: item.evidence_frame_id,
          object_key: item.object_key,
          byte_size: photo.blob.size,
        });
      }
      await confirmEvidenceUpload(contestId, {
        event_id: event.event_id,
        upload_session_id: intent.upload_session_id,
        frames: confirmedFrames,
      });
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      setState("done");
    } catch (err) {
      setState("capturing");
      setSubmitError(getAttendanceSubmitErrorMessage(err, scan?.purpose));
    }
  }, [allPhotosCaptured, contestId, photoBlobs, photoRequirements, scan]);

  return (
    <main className={styles.page} data-carbon-theme="g100">
      <section className={styles.cameraStage} data-step={activeStep}>
        <div className={styles.topBar}>
          <Button
            kind="ghost"
            className={styles.backButton}
            hasIconOnly
            renderIcon={ChevronLeft}
            iconDescription="返回"
            onClick={() => navigate(returnPath)}
          />
          <div className={styles.topTitle}>
            <strong>{navigationTitle}</strong>
          </div>
        </div>

        {activeStep === "scan" || activeStep === "photo" ? (
          <div className={styles.captureFlow}>
            <div className={styles.stepBadge} aria-label={`目前步驟 ${currentFlowStep} / ${totalFlowSteps}`}>
              步驟 {currentFlowStep} / {totalFlowSteps}
            </div>

            <div className={styles.stageCaption}>
              <h1>{stageTitle}</h1>
              <p>{stageDescription}</p>
            </div>

            {error ? (
              <div className={styles.notificationLayer}>
                <InlineNotification kind="error" title="無法完成簽到簽退" subtitle={error} lowContrast />
              </div>
            ) : null}

            {!(activeStep === "scan" && (manualMode || cameraState === "unavailable")) ? (
              <div className={styles.cameraPreview} data-step={activeStep}>
                {cameraActive ? (
                  <video
                    key={`${cameraFacingMode}-${photoIndex}`}
                    ref={videoRef}
                    className={styles.video}
                    autoPlay
                    playsInline
                    muted
                  />
                ) : scanValidating && frozenScanUrl ? (
                  <img className={styles.video} src={frozenScanUrl} alt="" />
                ) : (
                  <div className={styles.reviewBackdrop} />
                )}
                {activeStep === "scan" ? (
                  <div className={styles.scanFrame} data-status={scanValidating ? "validating" : "scanning"} aria-hidden="true">
                    {scanValidating ? <span /> : null}
                  </div>
                ) : (
                  <div className={styles.photoFrame} aria-hidden="true" />
                )}
              </div>
            ) : null}

            {activeStep === "scan" && !scanValidating && !(manualMode || cameraState === "unavailable") ? (
              <div className={styles.actionFooter}>
                <div className={styles.secondaryActions}>
                  <Button
                    kind="ghost"
                    className={styles.manualToggle}
                    onClick={handleUseManualCode}
                  >
                    手動輸入代碼
                  </Button>
                </div>
                <div className={styles.primaryActions}>
                  <span className={styles.statusChip}>{statusLabel}</span>
                  <Button kind="primary" renderIcon={QrCode} disabled>
                    正在掃描
                  </Button>
                </div>
              </div>
            ) : null}

            {activeStep === "scan" && scanValidating ? (
              <div className={styles.actionFooter}>
                <div />
                <span className={styles.statusChip}>{statusLabel}</span>
              </div>
            ) : null}

            {activeStep === "scan" && (manualMode || cameraState === "unavailable") ? (
              <form
                className={styles.manualPanel}
                onSubmit={(event) => {
                  event.preventDefault();
                  handleManualCodeSubmit();
                }}
              >
                <div>
                  <h1>輸入{purposeLabel}代碼</h1>
                  <p>請輸入教師投影畫面上 QR Code 下方的 8 碼代碼。</p>
                </div>
                <TextInput
                  id="attendance-manual-code"
                  labelText="手動代碼"
                  value={manualCode}
                  placeholder="ABCD-2345"
                  onChange={(event) => handleManualCodeChange(event.target.value)}
                />
                <div className={styles.actionFooter}>
                  <div className={styles.secondaryActions}>
                    {cameraState !== "unavailable" ? (
                      <Button kind="ghost" type="button" onClick={handleRescan}>
                        返回掃描
                      </Button>
                    ) : null}
                  </div>
                  <div className={styles.primaryActions}>
                    <Button type="submit">下一步</Button>
                  </div>
                </div>
              </form>
            ) : null}

            {activeStep === "photo" && state !== "submitting" ? (
              <div className={styles.actionFooter}>
                <span className={styles.statusChip}>{statusLabel}</span>
                <button
                  type="button"
                  className={styles.shutterButton}
                  disabled={!scan || cameraState !== "ready"}
                  aria-label={`拍攝${currentPhoto.label}`}
                  onClick={handleCapture}
                >
                  <span />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeStep === "photoReview" && reviewPhotoRequirement && reviewPhotoUrl ? (
          <div className={styles.reviewPage}>
            <header className={styles.reviewHeader}>
              <span className={styles.inlineStepBadge}>步驟 {currentFlowStep} / {totalFlowSteps}</span>
              <h1>{reviewPhotoRequirement.title}</h1>
              <p>{nextPhoto ? `下一步：${nextPhoto.title}` : "下一步：確認簽到資訊並上傳"}</p>
            </header>
            <figure className={styles.primaryPreview}>
              <img src={reviewPhotoUrl} alt={`${reviewPhotoRequirement.label}預覽`} />
              <figcaption>{reviewPhotoRequirement.label}</figcaption>
            </figure>
            <div className={styles.reviewActions}>
              <div className={styles.secondaryActions}>
                <Button kind="secondary" renderIcon={Camera} onClick={handleRetake}>
                  重新拍攝
                </Button>
              </div>
              <div className={styles.primaryActions}>
                <Button kind="primary" onClick={handleAcceptPhoto}>
                  {nextPhoto ? "下一步" : "確認資訊"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {activeStep === "confirm" || state === "done" ? (
          <div className={styles.reviewPage}>
            <header className={styles.reviewHeader}>
              <span className={styles.inlineStepBadge}>步驟 {currentFlowStep} / {totalFlowSteps}</span>
              {state === "done" ? (
                <div className={styles.successMark} aria-hidden="true">
                  <CheckmarkFilled size={42} />
                </div>
              ) : null}
              <h1>{state === "done" ? "提交成功" : `確認${purposeLabel}資訊`}</h1>
              <p>
                {state === "done"
                  ? "已記錄您的簽到簽退事件。請回到電腦上準備開始考試。"
                  : "確認資訊與照片清楚後即可上傳。"}
              </p>
            </header>
            {submitError ? (
              <InlineNotification
                kind="error"
                title="上傳失敗"
                subtitle={submitError}
                lowContrast
              />
            ) : null}
            {scan ? (
              <section className={styles.summary} aria-label="確認資訊">
                <div>
                  <span>類型</span>
                  <strong>{purposeLabel}</strong>
                </div>
                <div>
                  <span>掃描時間</span>
                  <strong>{formatTime(scannedAt)}</strong>
                </div>
                <div>
                  <span>照片狀態</span>
                  <strong>{completedPhotoCount}/{photoRequirements.length}</strong>
                </div>
              </section>
            ) : null}
            <section className={styles.photoReview} aria-label="佐證照片">
              {photoRequirements.map((requirement) => {
                const url = photoUrls[requirement.id];
                return url ? (
                  <figure key={requirement.id}>
                    <img src={url} alt={`${requirement.label}預覽`} />
                    <figcaption>{requirement.label}</figcaption>
                  </figure>
                ) : null;
              })}
            </section>
            <div className={styles.reviewActions}>
              {state === "done" ? (
                <>
                  <div />
                  <div className={styles.primaryActions}>
                    <Button kind="primary" onClick={() => navigate(returnPath)}>
                      返回競賽主頁
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.secondaryActions}>
                    <Button kind="secondary" renderIcon={Camera} disabled={state === "submitting"} onClick={handleRetake}>
                      重新拍攝
                    </Button>
                    <Button kind="ghost" renderIcon={Renew} disabled={state === "submitting"} onClick={handleRescan}>
                      重新掃描
                    </Button>
                  </div>
                  <div className={styles.primaryActions}>
                    <Button
                      kind="primary"
                      renderIcon={SendAlt}
                      disabled={!allPhotosCaptured || state === "submitting"}
                      onClick={handleSubmit}
                    >
                      {state === "submitting" ? "上傳中" : "確認並上傳"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
