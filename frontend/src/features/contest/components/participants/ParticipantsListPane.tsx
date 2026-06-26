import { SkeletonText } from "@carbon/react";
import {
  CheckmarkFilled,
  InProgress,
  PauseFilled,
  Time,
  WarningFilled,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type { ContestParticipant } from "@/core/entities/contest.entity";
import { formatScore } from "@/features/contest/utils/scoreFormat";
import {
  ListPanel,
  ListFooter,
  ListItem,
  ListItemContent,
  ListItemTitle,
  ListItemMeta,
} from "@/shared/ui/list/ListPanel";
import { EmptyState } from "@/shared/ui/EmptyState";

import styles from "./ContestParticipantsDashboard.module.scss";

interface ParticipantsListPaneProps {
  participants: ContestParticipant[];
  totalItems?: number;
  selectedUserId?: string | null;
  loading: boolean;
  onSelect: (userId: string) => void;
}

const getProfileDisplayName = (participant: ContestParticipant) =>
  participant.displayName ||
  participant.username;

const NEEDS_ATTENTION_STATUSES = new Set(["locked", "paused"]);
const STATUS_GROUP_ORDER = ["in_progress", "submitted", "not_started"];

const getGroupIcon = (groupId: string) => {
  switch (groupId) {
    case "needs_attention":
      return <WarningFilled size={16} />;
    case "in_progress":
      return <InProgress size={16} />;
    case "submitted":
      return <CheckmarkFilled size={16} />;
    case "paused":
    case "locked":
      return <PauseFilled size={16} />;
    default:
      return <Time size={16} />;
  }
};

const needsAttention = (participant: ContestParticipant) =>
  participant.violationCount > 0 ||
  NEEDS_ATTENTION_STATUSES.has(participant.examStatus ?? "");

const ParticipantsListPane: React.FC<ParticipantsListPaneProps> = ({
  participants,
  totalItems,
  selectedUserId,
  loading,
  onSelect,
}) => {
  const { t } = useTranslation("contest");
  const shownCount = participants.length;
  const totalCount = totalItems ?? participants.length;
  const participantsNeedingAttention = participants.filter(needsAttention);
  const normalParticipantsByStatus = participants
    .filter((participant) => !needsAttention(participant))
    .reduce<Record<string, ContestParticipant[]>>((groups, participant) => {
      const status = participant.examStatus ?? "unknown";
      groups[status] = groups[status] ?? [];
      groups[status].push(participant);
      return groups;
    }, {});
  const statusGroupKeys = [
    ...STATUS_GROUP_ORDER.filter((status) => normalParticipantsByStatus[status]?.length),
    ...Object.keys(normalParticipantsByStatus)
      .filter((status) => !STATUS_GROUP_ORDER.includes(status))
      .sort(),
  ];
  const participantGroups = [
    ...(participantsNeedingAttention.length > 0
      ? [
          {
            id: "needs_attention",
            title: t("participants.group.needsAttention", "需要處理"),
            participants: participantsNeedingAttention,
          },
        ]
      : []),
    ...statusGroupKeys.map((status) => ({
      id: status,
      title: t(`examStatus.${status}`, status),
      participants: normalParticipantsByStatus[status],
    })),
  ];

  const renderParticipantCard = (participant: ContestParticipant) => (
    <ListItem
      key={participant.userId}
      active={participant.userId === selectedUserId}
      onClick={() => onSelect(participant.userId)}
      className={styles.participantGridCard}
    >
      <ListItemContent className={styles.gridCardContent}>
        <div className={styles.gridCardMain}>
          <div className={styles.gridCardInfo}>
            <div className={styles.gridCardHeader}>
              <div className={styles.gridCardIdentity}>
                <ListItemTitle className={styles.gridCardName}>
                  {getProfileDisplayName(participant)}
                </ListItemTitle>
                <ListItemMeta className={styles.gridCardUsername}>
                  @{participant.username}
                </ListItemMeta>
              </div>
            </div>
            <span
              className={`${styles.gridCardViolation} ${
                participant.violationCount > 0 ? styles.gridCardViolationWarning : ""
              }`}
            >
              {t("dashboard.violations", "違規")} {participant.violationCount}
            </span>
          </div>
          <div className={styles.gridCardScore}>
            <span className={styles.gridCardScoreLabel}>
              {t("participants.headers.score", "分數")}
            </span>
            <span className={styles.gridCardScoreValue}>{formatScore(participant.score)}</span>
          </div>
        </div>
      </ListItemContent>
    </ListItem>
  );

  return (
    <ListPanel
      className={styles.listPaneCard}
      footer={
        <ListFooter>
          {t("participants.listFooterCount", "顯示 {{shown}} / {{total}} 位", {
            shown: shownCount,
            total: totalCount,
          })}
        </ListFooter>
      }
    >
      {loading ? (
        <div className={styles.skeletonStack}>
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className={styles.participantsSkeletonRow}>
              <SkeletonText heading width="60%" />
              <SkeletonText width="80%" />
              <SkeletonText width="50%" />
            </div>
          ))}
        </div>
      ) : participants.length === 0 ? (
        <EmptyState
          title={t("dashboard.emptyList", "目前沒有符合條件的參賽者")}
          compact
        />
      ) : (
        <div className={styles.participantGridWrap}>
          <div className={styles.participantGridSections}>
            {participantGroups.map((group) => (
              <section key={group.id} className={styles.participantGridSection}>
                <div
                  className={`${styles.participantGridSectionHeader} ${
                    group.id === "needs_attention" ? styles.participantGridSectionHeaderAttention : ""
                  }`}
                >
                  <span className={styles.participantGridSectionIcon}>
                    {getGroupIcon(group.id)}
                  </span>
                  <span className={styles.participantGridSectionTitle}>{group.title}</span>
                  <span className={styles.participantGridSectionCount}>
                    {group.participants.length}
                  </span>
                </div>
                <div className={styles.participantGrid}>
                  {group.participants.map(renderParticipantCard)}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </ListPanel>
  );
};

export default ParticipantsListPane;
