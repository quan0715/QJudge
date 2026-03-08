import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Button,
  InlineNotification,
  Modal,
  SkeletonPlaceholder,
  SkeletonText,
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
  compileExamVideos,
  deleteExamVideos,
  flagExamVideo,
  getExamVideoDownloadUrl,
  getExamVideoPlayUrl,
  listExamVideos,
  type ExamVideoDto,
} from "@/infrastructure/api/repositories/exam.repository";
import styles from "./ExamVideoReviewModal.module.scss";

interface Props {
  contestId?: string;
  open: boolean;
  onClose: () => void;
  userIdFilter?: string;
  canDelete?: boolean;
}

type TranslateFn = TFunction<"contest">;

const getJobStatusText = (video: ExamVideoDto, t: TranslateFn): string => {
  const status = (video.job_status || (video.has_video === false ? "pending" : "success")) as
    | "pending"
    | "running"
    | "success"
    | "failed";
  if (status === "failed") return t("examVideoReview.status.failed", "轉檔失敗");
  if (status === "running") return t("examVideoReview.status.running", "轉檔中");
  if (status === "pending") return t("examVideoReview.status.pending", "待轉檔");
  return t("examVideoReview.status.ready", "可播放");
};

const getJobTag = (video: ExamVideoDto, t: TranslateFn) => {
  const status = (video.job_status || (video.has_video === false ? "pending" : "success")) as
    | "pending"
    | "running"
    | "success"
    | "failed";
  const label = getJobStatusText(video, t);
  if (status === "failed") return <Tag type="red">{label}</Tag>;
  if (status === "running") return <Tag type="blue">{label}</Tag>;
  if (status === "pending") return <Tag type="cool-gray">{label}</Tag>;
  return <Tag type="green">{label}</Tag>;
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

const ExamVideoReviewSkeleton = () => (
  <div className={styles.skeletonGrid}>
    <Tile className={styles.skeletonTile}>
      <div className={styles.skeletonHeader}>
        <SkeletonText width="120px" />
        <SkeletonText width="64px" />
      </div>
      <div className={styles.skeletonList}>
        {[1, 2, 3, 4, 5].map((row) => (
          <div
            key={row}
            className={`${styles.skeletonRow} ${row === 1 ? styles.skeletonRowWithBorder : ""}`}
          >
            <SkeletonText width="70%" />
            <SkeletonText width="85%" />
            <SkeletonText width="60%" />
            <SkeletonText width="56px" />
            <SkeletonText width="72px" />
          </div>
        ))}
      </div>
    </Tile>

    <div className={styles.sideColumn}>
      <Tile className={styles.skeletonTile}>
        <SkeletonPlaceholder style={{ width: "100%", height: 220 }} />
      </Tile>

      <Tile className={styles.skeletonTile}>
        <div className={styles.skeletonMetaGrid}>
          {[1, 2, 3, 4, 5, 6].map((field) => (
            <div key={field} className={styles.skeletonField}>
              <SkeletonText width="48px" />
              <SkeletonText width="80%" />
            </div>
          ))}
        </div>
      </Tile>

      <Tile className={styles.skeletonTile}>
        <div>
          <SkeletonText width="48px" />
          <SkeletonPlaceholder
            className={styles.skeletonNote}
            style={{ width: "100%", height: 96 }}
          />
        </div>
        <div className={styles.skeletonActionRow}>
          {[1, 2, 3].map((button) => (
            <SkeletonPlaceholder key={button} style={{ width: 108, height: 40 }} />
          ))}
        </div>
      </Tile>
    </div>
  </div>
);

const ExamVideoReviewModal: React.FC<Props> = ({
  contestId,
  open,
  onClose,
  userIdFilter,
  canDelete = false,
}) => {
  const { t } = useTranslation("contest");
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<ExamVideoDto[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [playUrl, setPlayUrl] = useState("");
  const [note, setNote] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [playUrlLoading, setPlayUrlLoading] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compilingAll, setCompilingAll] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedVideo = useMemo(
    () => videos.find((v) => v.id === selectedId) || null,
    [videos, selectedId]
  );
  const tableHeaders = useMemo(
    () => [
      t("examVideoReview.headers.student", "學生"),
      t("examVideoReview.headers.updatedAt", "最後更新"),
      t("examVideoReview.headers.duration", "長度"),
      t("examVideoReview.headers.flag", "標記"),
    ],
    [t]
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
      const message = error instanceof Error ? error.message : t("examVideoReview.errors.load", "載入影片失敗");
      setErrorMessage(message);
      setVideos([]);
      setSelectedId(null);
      setPlayUrl("");
    } finally {
      setLoading(false);
    }
  }, [contestId, t, userIdFilter, selectedId]);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  useEffect(() => {
    if (!contestId || !selectedId || !selectedVideo || selectedVideo.has_video === false) {
      setPlayUrl("");
      setPlayUrlLoading(false);
      return;
    }
    const fetchPlayUrl = async () => {
      try {
        setErrorMessage("");
        setPlayUrl("");
        setPlayUrlLoading(true);
        const data = await getExamVideoPlayUrl(contestId, selectedId);
        setPlayUrl(data.url);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("examVideoReview.errors.playUrl", "載入播放連結失敗");
        setErrorMessage(message);
        setPlayUrl("");
      } finally {
        setPlayUrlLoading(false);
      }
    };
    void fetchPlayUrl();
  }, [contestId, selectedId, selectedVideo, t]);

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

  const handleCompile = async () => {
    if (!contestId || !selectedVideo) return;
    setCompiling(true);
    try {
      await compileExamVideos(contestId, [
        {
          user_id: selectedVideo.participant_user_id,
          upload_session_id: selectedVideo.upload_session_id,
        },
      ]);
      await reload();
    } catch {
      setErrorMessage(t("examVideoReview.errors.compile", "觸發轉檔失敗"));
    } finally {
      setCompiling(false);
    }
  };

  const pendingVideos = videos.filter(
    (v) => v.has_video === false && v.job_status !== "running"
  );
  const isMutating = compiling || compilingAll || deleting;

  const handleCompileAll = async () => {
    if (!contestId || !pendingVideos.length) return;
    setCompilingAll(true);
    try {
      const targets = pendingVideos.map((v) => ({
        user_id: v.participant_user_id,
        upload_session_id: v.upload_session_id,
      }));
      await compileExamVideos(contestId, targets);
      await reload();
    } catch {
      setErrorMessage(t("examVideoReview.errors.compileAll", "觸發批次轉檔失敗"));
    } finally {
      setCompilingAll(false);
    }
  };

  const handleDelete = async () => {
    if (!contestId || !selectedVideo || !canDelete) return;
    if (selectedVideo.job_status === "running") return;
    const confirmed = window.confirm(
      t(
        "examVideoReview.confirmDelete",
        `確定要刪除 ${selectedVideo.participant_username} 的監控影片資料嗎？此操作不可復原。`,
        { name: selectedVideo.participant_username }
      )
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const result = await deleteExamVideos(contestId, [
        {
          user_id: selectedVideo.participant_user_id,
          upload_session_id: selectedVideo.upload_session_id,
        },
      ]);
      if (result.blocked.length > 0) {
        setErrorMessage(t("examVideoReview.errors.deleteBlocked", "影片正在處理中，暫時無法刪除"));
      } else {
        setErrorMessage("");
      }
      await reload();
    } catch {
      setErrorMessage(t("examVideoReview.errors.delete", "刪除影片失敗"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      passiveModal
      size="lg"
      modalHeading={t("examVideoReview.modalHeading", "防弊影片檢視")}
    >
      <div className={styles.root}>
        {loading ? (
          <ExamVideoReviewSkeleton />
        ) : (
          <>
            {errorMessage && (
              <InlineNotification
                kind="error"
                lowContrast
                title={t("examVideoReview.loadErrorTitle", "載入監控影片失敗")}
                subtitle={errorMessage}
                hideCloseButton
              />
            )}

            {videos.length === 0 ? (
              <Tile className={styles.emptyState}>
                {t("examVideoReview.empty", "目前沒有可顯示的監控影片。")}
              </Tile>
            ) : (
              <div className={styles.contentGrid}>
                <Tile className={styles.listTile}>
                  <div className={styles.listHeader}>
                    <strong className={styles.listTitle}>
                      {t("examVideoReview.listTitle", "影片清單")}
                    </strong>
                    <div className={styles.listHeaderActions}>
                      {pendingVideos.length > 0 && (
                        <Button
                          kind="ghost"
                          size="sm"
                          onClick={handleCompileAll}
                          disabled={isMutating}
                        >
                          {compilingAll
                            ? t("examVideoReview.bulkCompiling", "送出中...")
                            : t("examVideoReview.bulkCompile", `全部轉檔 (${pendingVideos.length})`, {
                                count: pendingVideos.length,
                              })}
                        </Button>
                      )}
                      <Tag type="cool-gray">
                        {t("examVideoReview.videoCount", "{{count}} 筆", {
                          count: videos.length,
                        })}
                      </Tag>
                    </div>
                  </div>
                  <TableContainer>
                    <Table size="sm">
                      <TableHead>
                        <TableRow>
                          {tableHeaders.map((header) => (
                            <TableHeader key={header}>{header}</TableHeader>
                          ))}
                          <TableHeader>
                            {t("examVideoReview.headers.jobStatus", "轉檔狀態")}
                          </TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {videos.map((video) => {
                          const isSelected = video.id === selectedId;
                          return (
                            <TableRow
                              key={video.id}
                              className={`${styles.tableRow} ${
                                isSelected ? styles.tableRowSelected : ""
                              }`}
                              aria-selected={isSelected}
                              onClick={() => setSelectedId(video.id)}
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
                                  <Tag type="red">
                                    {t("examVideoReview.flag.suspected", "疑似")}
                                  </Tag>
                                ) : (
                                  <Tag type="green">
                                    {t("examVideoReview.flag.normal", "正常")}
                                  </Tag>
                                )}
                              </TableCell>
                              <TableCell>{getJobTag(video, t)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Tile>

                <div className={styles.sideColumn}>
                  <Tile className={styles.previewTile}>
                    <div className={styles.previewSurface}>
                      {selectedVideo?.has_video === false ? (
                        <div className={styles.previewMessage}>
                          {selectedVideo.job_status === "failed"
                            ? t(
                                "examVideoReview.preview.failed",
                                "影片轉檔失敗，請稍後重試或查看錯誤訊息。"
                              )
                            : selectedVideo.job_status === "running"
                              ? t(
                                  "examVideoReview.preview.running",
                                  "影片轉檔中，完成後會自動顯示。"
                                )
                              : t(
                                  "examVideoReview.preview.pending",
                                  "影片目前為待轉檔，手動送出轉檔後會顯示於此。"
                                )}
                        </div>
                      ) : selectedVideo && playUrlLoading ? (
                        <div className={styles.previewLoading}>
                          <SkeletonPlaceholder style={{ width: "100%", height: 188 }} />
                          <SkeletonText width="45%" />
                        </div>
                      ) : playUrl ? (
                        <video controls src={playUrl} className={styles.previewVideo} />
                      ) : (
                        <div className={styles.previewMessage}>
                          {t("examVideoReview.preview.selectVideo", "請選擇影片")}
                        </div>
                      )}
                    </div>
                  </Tile>

                  {selectedVideo && (
                    <Tile className={styles.metaTile}>
                      <div className={styles.metaGrid}>
                        <div className={styles.metaItem}>
                          <div className={styles.metaLabel}>
                            {t("examVideoReview.fields.student", "學生")}
                          </div>
                          <div className={styles.metaValue}>{selectedVideo.participant_username}</div>
                        </div>
                        <div className={styles.metaItem}>
                          <div className={styles.metaLabel}>
                            {t("examVideoReview.fields.fileSize", "檔案大小")}
                          </div>
                          <div className={styles.metaValue}>{formatBytes(selectedVideo.size_bytes)}</div>
                        </div>
                        <div className={styles.metaItem}>
                          <div className={styles.metaLabel}>
                            {t("examVideoReview.fields.duration", "影片長度")}
                          </div>
                          <div className={styles.metaValue}>{formatDuration(selectedVideo.duration_seconds)}</div>
                        </div>
                        <div className={styles.metaItem}>
                          <div className={styles.metaLabel}>
                            {t("examVideoReview.fields.frameCount", "幀數")}
                          </div>
                          <div className={styles.metaValue}>
                            {selectedVideo.frame_count.toLocaleString()} 幀 ({getFpsText(selectedVideo.frame_count, selectedVideo.duration_seconds)})
                          </div>
                        </div>
                        <div className={styles.metaItem}>
                          <div className={styles.metaLabel}>
                            {t("examVideoReview.fields.jobStatus", "轉檔狀態")}
                          </div>
                          <div className={styles.metaValue}>
                            {getJobStatusText(selectedVideo, t)}
                          </div>
                        </div>
                      </div>

                      <div className={styles.metaStatusRow}>
                        {selectedVideo.is_suspected ? (
                          <Tag type="red">
                            {t("examVideoReview.suspicion.suspected", "疑似作弊")}
                          </Tag>
                        ) : (
                          <Tag type="green">
                            {t("examVideoReview.suspicion.normal", "正常")}
                          </Tag>
                        )}
                        {getJobTag(selectedVideo, t)}
                      </div>
                      {!!selectedVideo.job_error_message && (
                        <div className={styles.errorBlock}>
                          <InlineNotification
                            kind="warning"
                            lowContrast
                            title={t("examVideoReview.transcodeErrorTitle", "轉檔錯誤")}
                            subtitle={selectedVideo.job_error_message}
                            hideCloseButton
                          />
                        </div>
                      )}
                    </Tile>
                  )}

                  <Tile className={styles.actionTile}>
                    <TextArea
                      id="video-note"
                      labelText={t("examVideoReview.note", "備註")}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className={styles.actionRow}>
                      <Button
                        kind="secondary"
                        size="sm"
                        onClick={handleDownload}
                        disabled={!selectedVideo || selectedVideo.has_video === false || isMutating}
                      >
                        {t("examVideoReview.actions.download", "下載影片")}
                      </Button>
                      <Button
                        kind="primary"
                        size="sm"
                        onClick={handleToggleFlag}
                        disabled={!selectedVideo || selectedVideo.has_video === false || isMutating}
                      >
                        {selectedVideo?.is_suspected
                          ? t("examVideoReview.actions.unflag", "取消疑似標記")
                          : t("examVideoReview.actions.flag", "標記疑似作弊")}
                      </Button>
                      <Button
                        kind="tertiary"
                        size="sm"
                        onClick={handleCompile}
                        disabled={!selectedVideo || isMutating || selectedVideo.job_status === "running"}
                      >
                        {compiling
                          ? t("examVideoReview.actions.submitting", "送出中...")
                          : t("examVideoReview.actions.compile", "開始轉檔")}
                      </Button>
                      {canDelete && (
                        <Button
                          kind="danger--tertiary"
                          size="sm"
                          onClick={handleDelete}
                          disabled={!selectedVideo || isMutating || selectedVideo?.job_status === "running"}
                        >
                          {deleting
                            ? t("examVideoReview.actions.deleting", "刪除中...")
                            : t("examVideoReview.actions.delete", "刪除影片")}
                        </Button>
                      )}
                    </div>
                  </Tile>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default ExamVideoReviewModal;
