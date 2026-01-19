import React from "react";
import { ClickableTile, Stack, Tag } from "@carbon/react";
import { Calendar, Time, CheckmarkFilled } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
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
          <Tag type={stateColor}>{stateLabel}</Tag>
        </div>

        <div className="contest-preview-card__meta">
          <span className="contest-preview-card__meta-item">
            <Calendar size={16} />
            {new Date(contest.startTime).toLocaleDateString()} -{" "}
            {new Date(contest.endTime).toLocaleDateString()}
          </span>
          <span className="contest-preview-card__meta-item">
            <Time size={16} />
            {t("list.duration", { defaultValue: "Duration" })}: {durationHours}h
          </span>
          {contest.organizer && (
            <span className="contest-preview-card__meta-item">
              <Tag type="cool-gray" size="sm">
                {t("list.organizer", "Host")}: {contest.organizer}
              </Tag>
            </span>
          )}
        </div>

        <div className="contest-preview-card__meta">
          <span className="contest-preview-card__meta-item">
            <Tag type={contest.isRegistered ? "green" : "gray"} size="sm">
              {contest.isRegistered
                ? t("hero.registered", "已參與")
                : t("hero.register", "未報名")}
            </Tag>
          </span>
          {contest.isRegistered && (
            <span className="contest-preview-card__meta-item">
              <CheckmarkFilled
                size={16}
                className="contest-preview-card__status-icon--success"
                aria-label={t("hero.registered", "已參與")}
              />
            </span>
          )}
        </div>
      </Stack>
    </ClickableTile>
  );
};

export default ContestPreviewCard;
