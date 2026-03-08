import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExamVideoReviewModal from "./ExamVideoReviewModal";

const listExamVideosMock = vi.fn();
const getExamVideoPlayUrlMock = vi.fn();
const getExamVideoDownloadUrlMock = vi.fn();
const flagExamVideoMock = vi.fn();
const compileExamVideosMock = vi.fn();
const deleteExamVideosMock = vi.fn();

const translationMap: Record<string, string> = {
  "examVideoReview.modalHeading": "防弊影片檢視",
  "examVideoReview.loadErrorTitle": "載入監控影片失敗",
  "examVideoReview.empty": "目前沒有可顯示的監控影片。",
  "examVideoReview.listTitle": "影片清單",
  "examVideoReview.videoCount": "{{count}} 筆",
  "examVideoReview.bulkCompile": "全部轉檔 ({{count}})",
  "examVideoReview.bulkCompiling": "送出中...",
  "examVideoReview.headers.student": "學生",
  "examVideoReview.headers.updatedAt": "最後更新",
  "examVideoReview.headers.duration": "長度",
  "examVideoReview.headers.flag": "標記",
  "examVideoReview.headers.jobStatus": "轉檔狀態",
  "examVideoReview.status.pending": "待轉檔",
  "examVideoReview.status.running": "轉檔中",
  "examVideoReview.status.failed": "轉檔失敗",
  "examVideoReview.status.ready": "可播放",
  "examVideoReview.flag.suspected": "疑似",
  "examVideoReview.flag.normal": "正常",
  "examVideoReview.preview.failed": "影片轉檔失敗，請稍後重試或查看錯誤訊息。",
  "examVideoReview.preview.running": "影片轉檔中，完成後會自動顯示。",
  "examVideoReview.preview.pending": "影片目前為待轉檔，手動送出轉檔後會顯示於此。",
  "examVideoReview.preview.selectVideo": "請選擇影片",
  "examVideoReview.fields.student": "學生",
  "examVideoReview.fields.fileSize": "檔案大小",
  "examVideoReview.fields.duration": "影片長度",
  "examVideoReview.fields.frameCount": "幀數",
  "examVideoReview.fields.jobStatus": "轉檔狀態",
  "examVideoReview.suspicion.suspected": "疑似作弊",
  "examVideoReview.suspicion.normal": "正常",
  "examVideoReview.transcodeErrorTitle": "轉檔錯誤",
  "examVideoReview.note": "備註",
  "examVideoReview.actions.download": "下載影片",
  "examVideoReview.actions.flag": "標記疑似作弊",
  "examVideoReview.actions.unflag": "取消疑似標記",
  "examVideoReview.actions.compile": "開始轉檔",
  "examVideoReview.actions.submitting": "送出中...",
  "examVideoReview.actions.delete": "刪除影片",
  "examVideoReview.actions.deleting": "刪除中...",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValueOrOptions?: string | Record<string, unknown>,
      maybeOptions?: Record<string, unknown>
    ) => {
      const options =
        typeof defaultValueOrOptions === "string"
          ? maybeOptions
          : (defaultValueOrOptions ?? {});
      const template =
        translationMap[key] ||
        (typeof defaultValueOrOptions === "string" ? defaultValueOrOptions : key);
      if (!options) return template;
      return Object.entries(options).reduce((text, [name, value]) => {
        return text.replace(`{{${name}}}`, String(value));
      }, template);
    },
  }),
}));

vi.mock("@/infrastructure/api/repositories/exam.repository", () => ({
  listExamVideos: (...args: unknown[]) => listExamVideosMock(...args),
  getExamVideoPlayUrl: (...args: unknown[]) => getExamVideoPlayUrlMock(...args),
  getExamVideoDownloadUrl: (...args: unknown[]) => getExamVideoDownloadUrlMock(...args),
  flagExamVideo: (...args: unknown[]) => flagExamVideoMock(...args),
  compileExamVideos: (...args: unknown[]) => compileExamVideosMock(...args),
  deleteExamVideos: (...args: unknown[]) => deleteExamVideosMock(...args),
}));

const buildVideo = (
  overrides: Partial<{
    id: number;
    participant_username: string;
    has_video: boolean;
    job_status: "pending" | "running" | "success" | "failed";
  }> = {}
) => ({
  id: overrides.id ?? 1,
  participant_user_id: overrides.id ?? 1,
  participant_username: overrides.participant_username ?? "student",
  upload_session_id: `session-${overrides.id ?? 1}`,
  bucket: "bucket",
  object_key: `video-${overrides.id ?? 1}.mp4`,
  duration_seconds: 120,
  frame_count: 360,
  size_bytes: 1024,
  is_suspected: false,
  suspected_note: "",
  created_at: "2026-03-09T10:00:00Z",
  updated_at: "2026-03-09T10:00:00Z",
  has_video: overrides.has_video ?? true,
  job_status: overrides.job_status ?? "success",
  job_error_message: "",
  job_raw_count: 360,
  job_updated_at: "2026-03-09T10:00:00Z",
  last_activity_at: "2026-03-09T10:00:00Z",
});

describe("ExamVideoReviewModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listExamVideosMock.mockResolvedValue([]);
    getExamVideoPlayUrlMock.mockResolvedValue({ url: "https://example.com/video.mp4" });
    getExamVideoDownloadUrlMock.mockResolvedValue({ url: "https://example.com/download.mp4" });
    flagExamVideoMock.mockResolvedValue({});
    compileExamVideosMock.mockResolvedValue({ queued: [] });
    deleteExamVideosMock.mockResolvedValue({ deleted: [], blocked: [] });
  });

  it("renders localized transcode statuses for all evidence states", async () => {
    listExamVideosMock.mockResolvedValue([
      buildVideo({ id: 1, participant_username: "ready-user", has_video: true, job_status: "success" }),
      buildVideo({ id: 2, participant_username: "pending-user", has_video: false, job_status: "pending" }),
      buildVideo({ id: 3, participant_username: "running-user", has_video: false, job_status: "running" }),
      buildVideo({ id: 4, participant_username: "failed-user", has_video: false, job_status: "failed" }),
    ]);

    render(<ExamVideoReviewModal contestId="contest-1" open onClose={vi.fn()} />);

    await screen.findByText("影片清單");
    expect(screen.getAllByText("可播放").length).toBeGreaterThan(0);
    expect(screen.getAllByText("待轉檔").length).toBeGreaterThan(0);
    expect(screen.getAllByText("轉檔中").length).toBeGreaterThan(0);
    expect(screen.getAllByText("轉檔失敗").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "全部轉檔 (2)" })).toBeInTheDocument();
  });

  it("shows pending preview guidance and localized compile action for pending videos", async () => {
    listExamVideosMock.mockResolvedValue([
      buildVideo({ id: 1, participant_username: "ready-user", has_video: true, job_status: "success" }),
      buildVideo({ id: 2, participant_username: "pending-user", has_video: false, job_status: "pending" }),
    ]);

    render(<ExamVideoReviewModal contestId="contest-1" open onClose={vi.fn()} />);

    await screen.findByText("pending-user");
    fireEvent.click(screen.getByText("pending-user"));

    await waitFor(() => {
      expect(
        screen.getByText("影片目前為待轉檔，手動送出轉檔後會顯示於此。")
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "開始轉檔" })).toBeInTheDocument();
  });
});
