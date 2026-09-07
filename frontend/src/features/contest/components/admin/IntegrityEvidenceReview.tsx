import { useEffect, useState } from "react";
import { InlineLoading, Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { getIntegrityEvidenceReview, type IntegrityEvidenceReview } from "@/infrastructure/api/repositories/exam.repository";
import { formatContestClockTime } from "@/features/contest/utils/contestTimeFormat";
import {
  buildEvidenceTimeSlices,
  filterEvidenceReviewItems,
  formatEvidenceRelativeRange,
} from "./integrityEvidenceTimeline";
import styles from "./IntegrityEvidenceReview.module.scss";

const SOURCE_LABELS = {
  screen_share: "Screen",
  webcam: "Webcam",
} as const;

export default function IntegrityEvidenceReview({
  contestId,
  eventId,
  occurredAt,
}: {
  contestId?: string;
  eventId?: string;
  occurredAt: string;
}) {
  const { t } = useTranslation("contest");
  const [review, setReview] = useState<IntegrityEvidenceReview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!contestId || !eventId) return;
    let active = true;
    setReview(null);
    setFailed(false);
    void getIntegrityEvidenceReview(contestId, eventId)
      .then((value) => { if (active) setReview(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [contestId, eventId]);

  if (!contestId || !eventId) return null;
  if (!review && !failed) return <InlineLoading description={String(t("logs.detail.loadingEvidence", "載入證據狀態中…"))} />;
  if (failed) return <span>{t("logs.detail.evidenceLoadFailed", "無法載入證據狀態")}</span>;
  if (!review) return null;
  const visibleItems = filterEvidenceReviewItems(review.items);
  const slices = buildEvidenceTimeSlices(visibleItems);
  const occurredAtMs = Date.parse(occurredAt);
  const sourceItems = {
    screen_share: visibleItems.filter((item) => item.source === "screen_share"),
    webcam: visibleItems.filter((item) => item.source === "webcam"),
  };
  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <div>
          <h5>{t("logs.detail.evidenceTimeline", "證據時間軸")}</h5>
          <span className={styles.anchor}>
            {t("logs.detail.incidentAt", "事件發生")}{" "}
            {formatContestClockTime(occurredAt, undefined, { includeSeconds: true })}
          </span>
        </div>
        <Tag type={review.evidenceStatus === "available" ? "green" : review.evidenceStatus === "unavailable" ? "red" : "cool-gray"}>
          {review.evidenceStatus}
        </Tag>
      </div>
      {slices.length === 0 ? (
        <p className={styles.empty}>{t("logs.detail.noIntegrityEvidence", "此事件尚無可播放證據片段")}</p>
      ) : (
        <div className={styles.timeline}>
          {slices.map((slice) => (
            <article key={`${slice.startAtMs}:${slice.endAtMs}`} className={styles.slice}>
              <div className={styles.sliceHeading}>
                <strong>
                  {formatContestClockTime(slice.startAtMs, undefined, { includeSeconds: true })}
                  {" – "}
                  {formatContestClockTime(slice.endAtMs, undefined, { includeSeconds: true })}
                </strong>
                {Number.isFinite(occurredAtMs) ? (
                  <span>{formatEvidenceRelativeRange(slice.startAtMs, slice.endAtMs, occurredAtMs)}</span>
                ) : null}
              </div>
              <div className={styles.players}>
                {slice.items.map((item) => {
                  const sourceList = sourceItems[item.source];
                  const index = sourceList.findIndex((candidate) => candidate.chunkId === item.chunkId) + 1;
                  const label = `${SOURCE_LABELS[item.source]} ${index}/${sourceList.length}`;
                  return (
                    <div key={item.chunkId} className={styles.player}>
                      <div className={styles.playerHeading}>
                        <Tag type={item.source === "webcam" ? "purple" : "cyan"} size="sm">
                          {SOURCE_LABELS[item.source]}
                        </Tag>
                        <span>{index}/{sourceList.length}</span>
                      </div>
                      {item.url ? (
                        <video
                          aria-label={label}
                          controls
                          preload="metadata"
                          src={item.url}
                        />
                      ) : (
                        <span className={styles.empty}>{item.status}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
