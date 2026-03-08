import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextArea,
  Tile,
} from "@carbon/react";
import {
  flagExamVideo,
  getExamVideoDownloadUrl,
  getExamVideoPlayUrl,
  listExamVideos,
  type ExamVideoDto,
} from "@/infrastructure/api/repositories/exam.repository";

interface Props {
  contestId?: string;
  open: boolean;
  onClose: () => void;
  userIdFilter?: string;
}

const tableHeaders = ["學生", "最後更新", "長度", "標記"];
const getJobTag = (video: ExamVideoDto) => {
  const status = (video.job_status || (video.has_video === false ? "pending" : "success")) as
    | "pending"
    | "running"
    | "success"
    | "failed";
  if (status === "failed") return <Tag type="red">轉檔失敗</Tag>;
  if (status === "running") return <Tag type="blue">轉檔中</Tag>;
  if (status === "pending") return <Tag type="cool-gray">排隊中</Tag>;
  return <Tag type="green">可播放</Tag>;
};

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex <= 1 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
};

const getFpsText = (frames: number, duration: number): string => {
  if (!duration || duration <= 0) return "-";
  return `${(frames / duration).toFixed(2)} FPS`;
};

const ExamVideoReviewModal: React.FC<Props> = ({
  contestId,
  open,
  onClose,
  userIdFilter,
}) => {
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<ExamVideoDto[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [playUrl, setPlayUrl] = useState("");
  const [note, setNote] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedVideo = useMemo(
    () => videos.find((v) => v.id === selectedId) || null,
    [videos, selectedId]
  );

  const reload = useCallback(async () => {
    if (!contestId) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await listExamVideos(contestId, {
        user_id: userIdFilter,
      });
      setVideos(data);
      if (data.length === 0) {
        setSelectedId(null);
        setPlayUrl("");
        return;
      }
      const matched = selectedId && data.some((v) => v.id === selectedId);
      const preferred = data.find((v) => v.has_video !== false) || data[0];
      const nextId = matched ? selectedId : preferred.id;
      setSelectedId(nextId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "載入影片失敗";
      setErrorMessage(message);
      setVideos([]);
      setSelectedId(null);
      setPlayUrl("");
    } finally {
      setLoading(false);
    }
  }, [contestId, userIdFilter, selectedId]);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  useEffect(() => {
    if (!contestId || !selectedId || !selectedVideo || selectedVideo.has_video === false) {
      setPlayUrl("");
      return;
    }
    const fetchPlayUrl = async () => {
      try {
        setErrorMessage("");
        const data = await getExamVideoPlayUrl(contestId, selectedId);
        setPlayUrl(data.url);
      } catch (error) {
        const message = error instanceof Error ? error.message : "載入播放連結失敗";
        setErrorMessage(message);
        setPlayUrl("");
      }
    };
    void fetchPlayUrl();
  }, [contestId, selectedId, selectedVideo]);

  useEffect(() => {
    setNote(selectedVideo?.suspected_note || "");
  }, [selectedVideo]);

  const handleDownload = async () => {
    if (!contestId || !selectedId || !selectedVideo || selectedVideo.has_video === false) return;
    const data = await getExamVideoDownloadUrl(contestId, selectedId);
    window.open(data.url, "_blank", "noopener,noreferrer");
  };

  const handleToggleFlag = async () => {
    if (!contestId || !selectedVideo || selectedVideo.has_video === false) return;
    const updated = await flagExamVideo(contestId, selectedVideo.id, {
      is_suspected: !selectedVideo.is_suspected,
      note,
    });
    setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
  };

  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      passiveModal
      size="lg"
      modalHeading="防弊影片檢視"
    >
      {loading ? (
        <InlineLoading description="載入影片中..." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {errorMessage && (
            <InlineNotification
              kind="error"
              lowContrast
              title="載入監控影片失敗"
              subtitle={errorMessage}
              hideCloseButton
            />
          )}

          {videos.length === 0 ? (
            <Tile style={{ padding: "0.75rem 1rem", color: "var(--cds-text-secondary)" }}>
              目前沒有可顯示的監控影片。
            </Tile>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: "1rem" }}>
              <Tile style={{ padding: "0.5rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.25rem 0.5rem 0.75rem",
                  }}
                >
                  <strong>影片清單</strong>
                  <Tag type="cool-gray">{videos.length} 筆</Tag>
                </div>
                <TableContainer>
                  <Table size="sm">
                    <TableHead>
                      <TableRow>
                        {tableHeaders.map((header) => (
                          <TableHeader key={header}>{header}</TableHeader>
                        ))}
                        <TableHeader>轉檔狀態</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {videos.map((video) => {
                        const isSelected = video.id === selectedId;
                        return (
                          <TableRow
                            key={video.id}
                            aria-selected={isSelected}
                            onClick={() => setSelectedId(video.id)}
                            style={{
                              cursor: "pointer",
                              background: isSelected
                                ? "var(--cds-layer-selected)"
                                : undefined,
                            }}
                          >
                            <TableCell>{video.participant_username}</TableCell>
                            <TableCell>
                              {new Date(
                                video.last_activity_at || video.job_updated_at || video.updated_at || video.created_at
                              ).toLocaleString()}
                            </TableCell>
                            <TableCell>{formatDuration(video.duration_seconds)}</TableCell>
                            <TableCell>
                              {video.is_suspected ? (
                                <Tag type="red">疑似</Tag>
                              ) : (
                                <Tag type="green">正常</Tag>
                              )}
                            </TableCell>
                            <TableCell>{getJobTag(video)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Tile>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <Tile style={{ padding: "0.5rem" }}>
                  <div
                    style={{
                      minHeight: 220,
                      background: "var(--cds-layer-01)",
                      border: "1px solid var(--cds-border-subtle)",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    {selectedVideo?.has_video === false ? (
                      <div style={{ padding: "1rem", color: "var(--cds-text-secondary)" }}>
                        {selectedVideo.job_status === "failed"
                          ? "影片轉檔失敗，請稍後重試或查看錯誤訊息。"
                          : "影片仍在處理中，完成後會自動顯示。"}
                      </div>
                    ) : playUrl ? (
                      <video controls src={playUrl} style={{ width: "100%", display: "block" }} />
                    ) : (
                      <div style={{ padding: "1rem", color: "var(--cds-text-secondary)" }}>
                        請選擇影片
                      </div>
                    )}
                  </div>
                </Tile>

                {selectedVideo && (
                  <Tile style={{ padding: "0.75rem" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "0.5rem 0.75rem",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <div>
                        <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>學生</div>
                        <div>{selectedVideo.participant_username}</div>
                      </div>
                      <div>
                        <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>檔案大小</div>
                        <div>{formatBytes(selectedVideo.size_bytes)}</div>
                      </div>
                      <div>
                        <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>影片長度</div>
                        <div>{formatDuration(selectedVideo.duration_seconds)}</div>
                      </div>
                      <div>
                        <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>幀數</div>
                        <div>
                          {selectedVideo.frame_count.toLocaleString()} 幀 ({getFpsText(selectedVideo.frame_count, selectedVideo.duration_seconds)})
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>轉檔狀態</div>
                        <div>{selectedVideo.job_status || (selectedVideo.has_video === false ? "pending" : "success")}</div>
                      </div>
                    </div>

                    {selectedVideo.is_suspected ? (
                      <Tag type="red">疑似作弊</Tag>
                    ) : (
                      <Tag type="green">正常</Tag>
                    )}
                    {!!selectedVideo.job_error_message && (
                      <div style={{ marginTop: "0.75rem" }}>
                        <InlineNotification
                          kind="warning"
                          lowContrast
                          title="轉檔錯誤"
                          subtitle={selectedVideo.job_error_message}
                          hideCloseButton
                        />
                      </div>
                    )}
                  </Tile>
                )}

                <Tile style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <TextArea
                    id="video-note"
                    labelText="備註"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Button
                      kind="secondary"
                      size="sm"
                      onClick={handleDownload}
                      disabled={!selectedVideo || selectedVideo.has_video === false}
                    >
                      下載影片
                    </Button>
                    <Button
                      kind="primary"
                      size="sm"
                      onClick={handleToggleFlag}
                      disabled={!selectedVideo || selectedVideo.has_video === false}
                    >
                      {selectedVideo?.is_suspected ? "取消疑似標記" : "標記疑似作弊"}
                    </Button>
                  </div>
                </Tile>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ExamVideoReviewModal;
