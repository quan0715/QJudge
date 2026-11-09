import { useCallback, useState, type ElementType } from "react";
import { SelectableTag, SkeletonText } from "@carbon/react";
import {
  CheckmarkFilled,
  CircleDash,
  InProgress,
  Locked,
  PauseFilled,
  Time,
  WarningFilled,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type { ContestParticipant } from "@/core/entities/contest.entity";
import { EXAM_STATUS_LABELS, getExamStatusLabel } from "@/features/contest/constants/examLabels";
import { getParticipantDisplayName, needsAttention } from "@/features/contest/domain/participantRoster";
import { formatScore } from "@/shared/utils/scoreFormat";
import styles from "./ParticipantCardGallery.module.scss";

type MetricKey = "score" | "violations" | "answerProgress" | "gradingProgress";
type Translate = (key: string, defaultValue: string, values?: Record<string, string | number>) => string;

interface MetricDisplay {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "danger";
  icon?: ElementType;
}

const METRIC_OPTIONS: Array<{ key: MetricKey; labelKey: string; defaultLabel: string }> = [
  { key: "score", labelKey: "adminOverview.command.metric.score", defaultLabel: "分數" },
  { key: "violations", labelKey: "adminOverview.command.metric.violations", defaultLabel: "異常事件" },
  { key: "answerProgress", labelKey: "adminOverview.command.metric.answerProgress", defaultLabel: "作答進度" },
  { key: "gradingProgress", labelKey: "adminOverview.command.metric.gradingProgress", defaultLabel: "批改進度" },
];

const STATUS_GROUP_ORDER = ["in_progress", "submitted"];

// Cards count a connected-but-not-streaming student as online, as the overview did.
const isConnected = (participant: ContestParticipant) =>
  Boolean(participant.liveMonitoringOnline) ||
  participant.connectionStatus === "live" ||
  participant.connectionStatus === "online";

const getStatusLabel = (participant: ContestParticipant) =>
  getExamStatusLabel(participant.examStatus) || EXAM_STATUS_LABELS[participant.examStatus] || participant.examStatus;

const getStatusIcon = (participant: ContestParticipant) => {
  if (participant.examStatus === "locked") return Locked;
  if (participant.examStatus === "paused") return PauseFilled;
  if (participant.examStatus === "submitted") return CheckmarkFilled;
  if (participant.examStatus === "in_progress") return InProgress;
  return CircleDash;
};

const getGroupIcon = (groupId: string) => {
  switch (groupId) {
    case "needs_attention":
      return WarningFilled;
    case "in_progress":
      return InProgress;
    case "submitted":
      return CheckmarkFilled;
    case "paused":
    case "locked":
      return PauseFilled;
    default:
      return Time;
  }
};

const getAnswerProgress = (participant: ContestParticipant, tr: Translate) => {
  switch (participant.examStatus) {
    case "submitted":
      return { value: "100%", detail: tr("examStatus.submitted", "已交卷") };
    case "in_progress":
      return { value: tr("adminOverview.command.metric.inProgress", "進行中"), detail: tr("examStatus.in_progress", "作答中") };
    case "locked":
      return { value: tr("adminOverview.command.metric.interrupted", "中斷"), detail: tr("examStatus.locked", "已鎖定") };
    case "paused":
      return { value: tr("examStatus.paused", "暫停"), detail: tr("adminOverview.command.metric.pausedDetail", "已暫停") };
    default:
      return { value: "0%", detail: tr("examStatus.not_started", "未開始") };
  }
};

const getGradingProgress = (participant: ContestParticipant, tr: Translate) =>
  participant.examStatus === "submitted"
    ? {
        value: tr("adminOverview.command.metric.scored", "已計分"),
        detail: tr("adminOverview.command.metric.scoreUnit", "{{score}} 分", { score: formatScore(participant.score ?? 0) }),
      }
    : { value: tr("adminOverview.command.metric.notSubmitted", "未交卷"), detail: getStatusLabel(participant) };

const getMetric = (participant: ContestParticipant, metric: MetricKey, tr: Translate): MetricDisplay => {
  if (metric === "violations") {
    return {
      label: tr("adminOverview.command.metric.violations", "異常事件"),
      value: String(participant.violationCount ?? 0),
      detail: tr("adminOverview.command.metric.eventUnit", "次"),
      tone: (participant.violationCount ?? 0) > 0 ? "danger" : "neutral",
    };
  }
  if (metric === "answerProgress") {
    return {
      label: tr("adminOverview.command.metric.answerProgress", "作答進度"),
      ...getAnswerProgress(participant, tr),
      tone: participant.examStatus === "locked" || participant.examStatus === "paused" ? "danger" : "neutral",
      icon: getStatusIcon(participant),
    };
  }
  if (metric === "gradingProgress") {
    return {
      label: tr("adminOverview.command.metric.gradingProgress", "批改進度"),
      ...getGradingProgress(participant, tr),
      tone: "neutral",
    };
  }
  return {
    label: tr("adminOverview.command.metric.score", "分數"),
    value: formatScore(participant.score ?? 0),
    detail: tr("adminOverview.command.metric.pointUnit", "分"),
    tone: "neutral",
  };
};

interface ParticipantCardGalleryProps {
  participants: ContestParticipant[];
  loading: boolean;
  onSelect: (userId: string) => void;
}

export default function ParticipantCardGallery({ participants, loading, onSelect }: ParticipantCardGalleryProps) {
  const { t } = useTranslation("contest");
  const tr = useCallback<Translate>(
    (key, defaultValue, values) => {
      const translated = values ? t(key, { defaultValue, ...values }) : t(key, defaultValue);
      return typeof translated === "string"
        ? translated
        : defaultValue.replace(/{{(\w+)}}/g, (_, name) => String(values?.[name] ?? ""));
    },
    [t],
  );
  const [metric, setMetric] = useState<MetricKey>("score");

  const attention = participants.filter(needsAttention);
  const byStatus = participants
    .filter((participant) => !needsAttention(participant))
    .reduce<Record<string, ContestParticipant[]>>((groups, participant) => {
      const status = participant.examStatus ?? "unknown";
      groups[status] = groups[status] ?? [];
      groups[status].push(participant);
      return groups;
    }, {});
  const statusKeys = [
    ...STATUS_GROUP_ORDER.filter((status) => byStatus[status]?.length),
    ...Object.keys(byStatus)
      .filter((status) => !STATUS_GROUP_ORDER.includes(status))
      .sort(),
  ];
  const groups = [
    ...(attention.length > 0
      ? [{ id: "needs_attention", title: tr("adminOverview.command.filters.needsAttention", "需要處理"), participants: attention }]
      : []),
    ...statusKeys.map((status) => ({
      id: status,
      title: tr(
        `examStatus.${status}`,
        getExamStatusLabel(status as ContestParticipant["examStatus"]) ||
          EXAM_STATUS_LABELS[status as ContestParticipant["examStatus"]] ||
          status,
      ),
      participants: byStatus[status],
    })),
  ];

  const metricTags = (
    <div className={styles.metricTagGroup} aria-label={t("adminOverview.command.metricSwitcher", "考生卡片資料切換")}>
      {METRIC_OPTIONS.map((option) => (
        <SelectableTag
          key={option.key}
          id={`participant-metric-${option.key}`}
          text={t(option.labelKey, option.defaultLabel)}
          selected={metric === option.key}
          onChange={() => setMetric(option.key)}
          size="sm"
        />
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className={styles.participantGridSections} aria-label={t("adminOverview.command.participants.loading", "考生列表載入中")}>
        {Array.from({ length: 8 }).map((_, index) => (
          <div className={styles.participantCard} key={index}>
            <SkeletonText heading width="60%" />
            <SkeletonText width="42%" />
            <SkeletonText width="5rem" />
          </div>
        ))}
      </div>
    );
  }
  if (participants.length === 0) {
    return <div className={styles.emptyState}>{t("adminOverview.command.participants.empty", "目前沒有考生")}</div>;
  }

  return (
    <>
      {metricTags}
      <div className={styles.participantGridSections}>
        {groups.map((group) => {
          const GroupIcon = getGroupIcon(group.id);
          const headingId = `participant-group-${group.id}`;
          return (
            <section key={group.id} className={styles.participantGroup} aria-labelledby={headingId}>
              <div
                id={headingId}
                className={`${styles.participantGroupHeader} ${
                  group.id === "needs_attention" ? styles.participantGroupHeaderAttention : ""
                }`}
              >
                <GroupIcon size={16} />
                <span>{group.title}</span>
                <strong>{group.participants.length}</strong>
              </div>
              <div className={styles.participantGrid}>
                {group.participants.map((participant) => {
                  const connected = isConnected(participant);
                  const display = getMetric(participant, metric, tr);
                  const MetricIcon = display.icon;
                  const connectionLabel = connected
                    ? t("adminOverview.command.connection.online", "在線")
                    : t("adminOverview.command.connection.offline", "離線");
                  return (
                    <button
                      key={participant.userId}
                      type="button"
                      className={styles.participantCard}
                      onClick={() => onSelect(participant.userId)}
                    >
                      <div className={styles.participantCardHeader}>
                        <div className={styles.participantIdentity}>
                          <strong>{getParticipantDisplayName(participant)}</strong>
                          <span>@{participant.username}</span>
                          <span className={styles.participantConnection}>
                            <span className={connected ? styles.liveDot : styles.offlineDot} aria-hidden="true" />
                            {connectionLabel}
                          </span>
                        </div>
                        <div
                          className={`${styles.participantSingleMetric} ${
                            display.tone === "danger" ? styles.metricDanger : ""
                          }`}
                        >
                          <span>{display.label}</span>
                          <strong>
                            {MetricIcon ? <MetricIcon size={16} /> : null}
                            {display.value}
                          </strong>
                          {display.detail ? <small>{display.detail}</small> : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
