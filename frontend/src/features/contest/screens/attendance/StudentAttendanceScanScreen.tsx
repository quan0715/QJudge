import { useCallback, useEffect, useRef, useState } from "react";
import { Button, InlineNotification } from "@carbon/react";
import { useNavigate, useParams } from "react-router";
import jsQR from "jsqr";

import { parseAttendanceQrValue, type ParsedAttendanceQr } from "@/features/contest/attendance/attendanceQr";
import { createAttendanceEvent } from "@/infrastructure/api/repositories/attendance.repository";
import {
  confirmEvidenceUpload,
  createEvidenceUploadIntent,
} from "@/infrastructure/api/repositories/exam.repository";
import styles from "./StudentAttendanceScanScreen.module.scss";

type ScanState = "scanning" | "capturing" | "submitting" | "done";
type CameraState = "requesting" | "ready" | "unavailable";
type ScannerMode = "waiting" | "native" | "js";
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
};
type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
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

export default function StudentAttendanceScanScreen() {
  const { classroomId, contestId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<ScanState>("scanning");
  const [scan, setScan] = useState<ParsedAttendanceQr | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("requesting");
  const [scannerMode, setScannerMode] = useState<ScannerMode>("waiting");

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        setCameraState("requesting");
        setScannerMode("waiting");
        if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
          throw new Error("此瀏覽器不支援相機存取，請改由教師協助簽到。");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
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
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (cameraState !== "ready" || state !== "scanning" || scan) return;
    let detector: BarcodeDetectorLike | null = null;
    let stopped = false;
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
        setScan(parsed);
        setState("capturing");
        setError(null);
      }
    };
    const timer = window.setInterval(() => {
      if (!stopped) void tick();
    }, 500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [cameraState, scan, state]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      const blob = await captureBlob(videoRef.current);
      setPhotoBlob(blob);
      setPhotoUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to capture photo");
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!contestId || !scan || !photoBlob) return;
    setState("submitting");
    try {
      const event = await createAttendanceEvent(contestId, {
        mode: "student_self_scan",
        purpose: scan.purpose,
        token: scan.token,
        client_observed_at_ms: Date.now(),
        device_kind: "mobile",
      });
      const capturedAt = Date.now();
      const intent = await createEvidenceUploadIntent(contestId, {
        event_id: event.event_id,
        evidence_cluster_id: event.evidence_cluster_id,
        source_module: "attendance",
        evidence_mode: "audit",
        frames: [{ client_captured_at_ms: capturedAt, seq: 1 }],
      });
      const item = intent.items[0];
      if (item) {
        const response = await fetch(item.put_url, {
          method: "PUT",
          headers: item.required_headers || { "Content-Type": "image/webp" },
          body: photoBlob,
        });
        if (!response.ok) throw new Error("Photo upload failed");
        await confirmEvidenceUpload(contestId, {
          event_id: event.event_id,
          upload_session_id: intent.upload_session_id,
          frames: [{
            evidence_frame_id: item.evidence_frame_id,
            object_key: item.object_key,
            byte_size: photoBlob.size,
          }],
        });
      }
      setState("done");
    } catch (err) {
      setState("capturing");
      setError(err instanceof Error ? err.message : "Attendance submit failed");
    }
  }, [contestId, photoBlob, scan]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>QJudge</header>
      <section className={styles.content}>
        {error ? <InlineNotification kind="error" title="無法完成簽到簽退" subtitle={error} lowContrast /> : null}
        <div className={styles.panel}>
          <div className={styles.status}>
            {cameraState === "requesting"
              ? "等待相機授權"
              : scannerMode === "waiting"
                ? "準備掃描"
                : "掃描 QR code"}
          </div>
          <video ref={videoRef} className={styles.video} autoPlay playsInline muted />
          {scan ? (
            <InlineNotification
              kind="success"
              title={scan.purpose === "check_in" ? "已掃描簽到 QR" : "已掃描簽退 QR"}
              subtitle="請拍攝現場環境照片作為佐證。"
              lowContrast
              hideCloseButton
            />
          ) : null}
          {photoUrl ? <img className={styles.photo} src={photoUrl} alt="" /> : null}
          <div className={styles.actions}>
            <Button disabled={!scan || state === "submitting"} onClick={handleCapture}>拍攝照片</Button>
            <Button kind="primary" disabled={!photoBlob || state === "submitting"} onClick={handleSubmit}>提交佐證</Button>
            <Button kind="ghost" onClick={() => navigate(`/classrooms/${classroomId}/contest/${contestId}`)}>
              返回
            </Button>
          </div>
          {state === "done" ? (
            <InlineNotification kind="success" title="提交成功" subtitle="已記錄您的簽到簽退事件。" lowContrast />
          ) : null}
        </div>
      </section>
    </main>
  );
}
