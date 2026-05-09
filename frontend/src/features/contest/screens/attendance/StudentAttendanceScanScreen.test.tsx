import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Module mocks --------------------------------------------------------

vi.mock("react-i18next", () => {
  const interpolate = (template: string, values: Record<string, unknown>) =>
    template.replace(/{{(\w+)}}/g, (_, name) => String(values?.[name] ?? ""));
  return {
    initReactI18next: { type: "3rdParty", init: () => undefined },
    useTranslation: () => ({
      t: (key: string, defaultOrOptions?: unknown, valuesArg?: unknown) => {
        if (typeof defaultOrOptions === "string") {
          if (valuesArg && typeof valuesArg === "object") {
            return interpolate(defaultOrOptions, valuesArg as Record<string, unknown>);
          }
          return defaultOrOptions;
        }
        if (defaultOrOptions && typeof defaultOrOptions === "object") {
          const opts = defaultOrOptions as { defaultValue?: string } & Record<string, unknown>;
          if (typeof opts.defaultValue === "string") return interpolate(opts.defaultValue, opts);
        }
        return key;
      },
      i18n: { language: "zh-TW", changeLanguage: vi.fn() },
    }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
  };
});

const mockGetContest = vi.fn();
const mockValidateAttendanceCredential = vi.fn();
const mockCreateAttendanceEvent = vi.fn();
const mockCreateEvidenceUploadIntent = vi.fn();
const mockConfirmEvidenceUpload = vi.fn();

vi.mock("@/infrastructure/api/repositories/contest.repository", () => ({
  getContest: (...args: unknown[]) => mockGetContest(...args),
}));

vi.mock("@/infrastructure/api/repositories/attendance.repository", () => ({
  validateAttendanceCredential: (...args: unknown[]) =>
    mockValidateAttendanceCredential(...args),
  createAttendanceEvent: (...args: unknown[]) => mockCreateAttendanceEvent(...args),
}));

vi.mock("@/infrastructure/api/repositories/exam.repository", () => ({
  createEvidenceUploadIntent: (...args: unknown[]) =>
    mockCreateEvidenceUploadIntent(...args),
  confirmEvidenceUpload: (...args: unknown[]) => mockConfirmEvidenceUpload(...args),
}));

let capturedOnDetected: ((raw: string) => void) | null = null;

vi.mock("./hooks/useQrScanner", () => ({
  useQrScanner: ({
    onDetected,
  }: {
    videoRef: unknown;
    active: boolean;
    onDetected: (raw: string) => void;
  }) => {
    capturedOnDetected = onDetected;
    return "native" as const;
  },
}));

vi.mock("./hooks/useCameraStream", () => {
  return {
    useCameraStream: () => {
      const videoRef = useRef<HTMLVideoElement | null>(null);
      const streamRef = useRef<MediaStream | null>(null);
      useEffect(() => {
        if (!videoRef.current) {
          const fakeVideo = document.createElement("video");
          Object.defineProperty(fakeVideo, "videoWidth", { value: 640 });
          Object.defineProperty(fakeVideo, "videoHeight", { value: 480 });
          videoRef.current = fakeVideo;
        }
      }, []);
      const setVideoElement = (node: HTMLVideoElement | null) => {
        if (node) videoRef.current = node;
      };
      return {
        videoRef,
        setVideoElement,
        streamRef,
        cameraState: "ready" as const,
        cameraError: null,
        stopStream: () => undefined,
      };
    },
  };
});

vi.mock("./hooks/useHaptics", () => ({
  useHaptics: () => () => undefined,
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) => {
          return <div style={style}>{children}</div>;
        },
    },
  ),
}));

import StudentAttendanceScanScreen from "./StudentAttendanceScanScreen";

// ---- Browser polyfills for jsdom ----------------------------------------

beforeAll(() => {
  if (!("createObjectURL" in URL)) {
    Object.defineProperty(URL, "createObjectURL", {
      value: () => "blob:fake",
      writable: true,
    });
  } else {
    URL.createObjectURL = () => "blob:fake";
  }
  if (!("revokeObjectURL" in URL)) {
    Object.defineProperty(URL, "revokeObjectURL", { value: () => undefined, writable: true });
  } else {
    URL.revokeObjectURL = () => undefined;
  }
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return {
      drawImage: () => undefined,
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    } as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement["getContext"];
  HTMLCanvasElement.prototype.toBlob = function toBlob(callback: BlobCallback) {
    callback(new Blob(["fake"], { type: "image/webp" }));
  };
});

// ---- Helpers ------------------------------------------------------------

function renderScreen(initialUrl = "/classrooms/c1/contest/cid?purpose=check_in") {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route
          path="/classrooms/:classroomId/contest/:contestId"
          element={<StudentAttendanceScanScreen />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

// ---- Tests --------------------------------------------------------------

describe("StudentAttendanceScanScreen happy path", () => {
  beforeEach(() => {
    capturedOnDetected = null;
    mockGetContest.mockResolvedValue({
      id: "cid",
      name: "Test Contest",
      attendancePhotoPolicy: "room",
      attendanceStatus: { canCheckIn: true, canCheckOut: false },
    });
    mockValidateAttendanceCredential.mockResolvedValue({
      valid: true,
      purpose: "check_in",
      credential_source: "qr_token",
    });
    mockCreateAttendanceEvent.mockResolvedValue({
      event_id: 42,
      purpose: "check_in",
      source_module: "attendance",
      evidence_cluster_id: "cluster-1",
      recorded_at: "2026-05-09T10:00:00Z",
      attendance_status: { canCheckIn: false, canCheckOut: true },
    });
    mockCreateEvidenceUploadIntent.mockResolvedValue({
      upload_session_id: "session-1",
      items: [
        {
          evidence_frame_id: "frame-1",
          object_key: "object-1",
          put_url: "https://upload.example/frame-1",
          required_headers: { "Content-Type": "image/webp" },
        },
      ],
    });
    mockConfirmEvidenceUpload.mockResolvedValue({ ok: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: true, status: 200 } as unknown as Response),
      ),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("walks scan → photo → confirm → done and triggers the upload pipeline", async () => {
    renderScreen();

    await waitFor(() => expect(mockGetContest).toHaveBeenCalledWith("cid"));
    await waitFor(() => expect(capturedOnDetected).not.toBeNull());

    // Step 1: scan QR.
    await act(async () => {
      capturedOnDetected!("qj-att:v1:check_in:tok-abc");
    });

    await waitFor(() =>
      expect(mockValidateAttendanceCredential).toHaveBeenCalledWith("cid", {
        purpose: "check_in",
        token: "tok-abc",
        manualCode: undefined,
      }),
    );

    // Step 2: shutter button appears once we are on the photo step.
    const shutter = await screen.findByRole("button", { name: /拍攝現場照片/ });
    await act(async () => {
      fireEvent.click(shutter);
    });

    // Step 3: review screen → confirm info CTA.
    const confirmInfo = await screen.findByRole("button", { name: "確認資訊" });
    await act(async () => {
      fireEvent.click(confirmInfo);
    });

    // Step 4: confirm → upload.
    const confirmUpload = await screen.findByRole("button", { name: "確認並上傳" });
    await act(async () => {
      fireEvent.click(confirmUpload);
    });

    await waitFor(() =>
      expect(mockCreateAttendanceEvent).toHaveBeenCalledWith("cid", {
        mode: "student_self_scan",
        purpose: "check_in",
        token: "tok-abc",
        manualCode: undefined,
        client_observed_at_ms: expect.any(Number),
        device_kind: "mobile",
      }),
    );
    await waitFor(() =>
      expect(mockCreateEvidenceUploadIntent).toHaveBeenCalledWith(
        "cid",
        expect.objectContaining({
          event_id: 42,
          evidence_cluster_id: "cluster-1",
          source_module: "attendance",
          evidence_mode: "audit",
        }),
      ),
    );
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockConfirmEvidenceUpload).toHaveBeenCalledWith(
        "cid",
        expect.objectContaining({
          event_id: 42,
          upload_session_id: "session-1",
          frames: [
            expect.objectContaining({
              evidence_frame_id: "frame-1",
              object_key: "object-1",
            }),
          ],
        }),
      ),
    );

    // Step 5: done state surfaces the "back to exam" CTA.
    await screen.findByRole("button", { name: "返回考試" });
  });

  it("surfaces validation errors when the QR token is rejected", async () => {
    mockValidateAttendanceCredential.mockRejectedValueOnce(
      Object.assign(new Error("invalid_attendance_token"), {
        body: { error: { code: "invalid_attendance_token" } },
      }),
    );

    renderScreen();
    await waitFor(() => expect(capturedOnDetected).not.toBeNull());

    await act(async () => {
      capturedOnDetected!("qj-att:v1:check_in:expired-token");
    });

    await screen.findByRole("button", { name: "重新對準" });
    expect(mockCreateAttendanceEvent).not.toHaveBeenCalled();
  });
});
