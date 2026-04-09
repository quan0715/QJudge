import React from "react";
import { ClickableTile, Stack, Tag } from "@carbon/react";
import { Calendar, Time, CheckmarkFilled } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { formatDateTime, DATE_FORMATS } from "@/i18n/dateUtils";
import type { Contest } from "@/core/entities/contest.entity";
import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
} from "@/core/entities/contest.entity";
import "./ContestPreviewCard.scss";

export interface ContestPreviewCardProps {
  contest: Contest;
  onSelect?: (contest: Contest) => void;
}

export const ContestPreviewCard: React.FC<ContestPreviewCardProps> = ({
  contest,
  onSelect,
}) => {
  const { t } = useTranslation("contest");
  const handleClick = () => onSelect?.(contest);

  const contestState = getContestState(contest);
  const stateLabel = getContestStateLabel(contestState);
  const stateColor = getContestStateColor(contestState);
  const showResultsPublishedBadge =
    contestState === "ended" && contest.resultsPublished;
  const primaryBadgeLabel = showResultsPublishedBadge
    ? t("badge.resultsPublished", "成績已發佈")
    : stateLabel;
  const primaryBadgeType = showResultsPublishedBadge
    ? "green"
    : stateColor;
  const durationHours = Math.max(
    0,
    Math.round(
      (new Date(contest.endTime).getTime() -
        new Date(contest.startTime).getTime()) /
        360000
    ) / 10
  );

  return (
    <ClickableTile onClick={handleClick} className="contest-preview-card">
      <Stack gap={3}>
        <div className="contest-preview-card__header">
          <h3 className="contest-preview-card__title">{contest.name}</h3>
          <div className="contest-preview-card__badges">
            <Tag type={primaryBadgeType}>{primaryBadgeLabel}</Tag>
          </div>
        </div>

        <div className="contest-preview-card__meta">
          <span className="contest-preview-card__meta-item">
            <Calendar size={16} />
            {formatDateTime(contest.startTime, DATE_FORMATS.DATE_ONLY)} -{" "}
            {formatDateTime(contest.endTime, DATE_FORMATS.DATE_ONLY)}
          </span>
          <span className="contest-preview-card__meta-item">
            <Time size={16} />
            {t("list.duration")}: {durationHours}h
          </span>
        </div>

        <div className="contest-preview-card__meta">
          <span className="contest-preview-card__meta-item">
            <Tag type={contest.isRegistered ? "green" : "gray"} size="sm">
              {contest.isRegistered
                ? t("hero.registered")
                : t("hero.register")}
            </Tag>
          </span>
          {contest.isRegistered && (
            <span className="contest-preview-card__meta-item">
              <CheckmarkFilled
                size={16}
                className="contest-preview-card__status-icon--success"
                aria-label={t("hero.registered")}
              />
            </span>
          )}
        </div>
      </Stack>
    </ClickableTile>
  );
};

export default ContestPreviewCard;
