import { Modal, Tag } from "@carbon/react";
import { Calendar, Time, Trophy, UserMultiple } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { BoundContest } from "@/core/entities/classroom.entity";
import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
} from "@/core/entities/contest.entity";
import { formatDate } from "@/shared/utils/format";
import { getBoundContestTimeRange } from "@/features/classroom/domain/classroomActivityTimeline";

interface ClassroomContestPreviewModalProps {
  contest: BoundContest | null;
  open: boolean;
  onClose: () => void;
  onEnterContest: (contestId: string) => void;
}

export function ClassroomContestPreviewModal({
  contest,
  open,
  onClose,
  onEnterContest,
}: ClassroomContestPreviewModalProps) {
  const { t } = useTranslation("classroom");

  if (!contest) return null;

  const { startMs, endMs } = getBoundContestTimeRange(contest);
  const state = getContestState({
    status: contest.contestStatus,
    startTime: Number.isNaN(startMs)
      ? undefined
      : new Date(startMs).toISOString(),
    endTime: Number.isNaN(endMs) ? undefined : new Date(endMs).toISOString(),
  });
  const typeLabel = t("activitySchedule.previewTypeExam", "考試 / 競賽");

  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      onRequestSubmit={() => onEnterContest(contest.contestId)}
      modalHeading={contest.contestName}
      primaryButtonText={t("activitySchedule.previewEnter", "前往競賽")}
      secondaryButtonText={t("common:button.cancel", "取消")}
      size="sm"
    >
      <div className="classroom-contest-preview">
        <div className="classroom-contest-preview__tags">
          <Tag type={getContestStateColor(state)}>
            {getContestStateLabel(state)}
          </Tag>
          <Tag type="blue" renderIcon={Trophy}>
            {typeLabel}
          </Tag>
        </div>

        <dl className="classroom-contest-preview__meta">
          <div className="classroom-contest-preview__meta-item">
            <dt>
              <Calendar size={16} />
              {t("activitySchedule.previewStartTime", "開始時間")}
            </dt>
            <dd>
              {formatDate(contest.contestStartTime || contest.boundAt, {
                includeSeconds: false,
              })}
            </dd>
          </div>
          <div className="classroom-contest-preview__meta-item">
            <dt>
              <Time size={16} />
              {t("activitySchedule.previewEndTime", "結束時間")}
            </dt>
            <dd>
              {formatDate(contest.contestEndTime || contest.boundAt, {
                includeSeconds: false,
              })}
            </dd>
          </div>
          <div className="classroom-contest-preview__meta-item">
            <dt>
              <UserMultiple size={16} />
              {t("activitySchedule.previewParticipants", "參與人數")}
            </dt>
            <dd>{contest.participantCount}</dd>
          </div>
        </dl>

        <div className="classroom-contest-preview__description">
          <h3>{t("activitySchedule.previewDescription", "說明")}</h3>
          <p>
            {contest.contestDescription?.trim() ||
              t(
                "activitySchedule.previewDescriptionEmpty",
                "這個競賽目前沒有補充說明。",
              )}
          </p>
        </div>
      </div>
    </Modal>
  );
}
