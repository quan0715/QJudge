import {
  SkeletonText,
  Tag,
} from "@carbon/react";
import { useTranslation } from "react-i18next";

import type { ContestParticipant } from "@/core/entities/contest.entity";
import ContainerCard from "@/shared/layout/ContainerCard";

import styles from "./ContestParticipantsDashboard.module.scss";

interface ParticipantsListPaneProps {
  participants: ContestParticipant[];
  totalItems?: number;
  selectedUserId?: string | null;
  loading: boolean;
  onSelect: (userId: string) => void;
}

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

  return (
    <ContainerCard
      className={`${styles.pane} ${styles.listPaneCard}`}
      noPadding
      withLayer={false}
    >
      <div className={styles.paneInner}>
        <div className={styles.listPaneHeader}>
          <h4 className={styles.listPaneHeaderTitle}>
            {t("participants.listHeaderTitle", "學生列表")}
          </h4>
        </div>
        <div className={`${styles.scrollPane} ${styles.list} ${styles.listPaneBody}`}>
          {loading ? (
            <div className={styles.skeletonStack}>
              {[1, 2, 3, 4, 5].map((row) => (
                <div key={row} className={styles.listItem}>
                  <SkeletonText heading width="60%" />
                  <SkeletonText width="80%" />
                  <SkeletonText width="50%" />
                </div>
              ))}
            </div>
          ) : participants.length === 0 ? (
            <div className={styles.emptyState}>
              {t("participantsDashboard.emptyList", "目前沒有符合條件的參賽者")}
            </div>
          ) : (
            participants.map((participant) => {
              const isSelected = participant.userId === selectedUserId;
              return (
                <div
                  key={participant.userId}
                  className={`${styles.listItem} ${isSelected ? styles.listItemSelected : ""}`}
                  onClick={() => onSelect(participant.userId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(participant.userId);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.listItemHeader}>
                    <div className={styles.listItemName}>
                      <span className={styles.primaryText}>
                        {participant.userDisplayName ||
                          participant.displayName ||
                          participant.nickname ||
                          participant.username}
                      </span>
                      <span className={styles.secondaryText}>@{participant.username}</span>
                    </div>
                    <Tag
                      type="outline"
                      size="sm"
                      className={`${styles.listStatusTag} ${
                        participant.examStatus === "submitted" ? styles.listStatusTagSubmitted : ""
                      }`}
                    >
                      {t(`examStatus.${participant.examStatus}`, participant.examStatus)}
                    </Tag>
                  </div>

                  <div className={styles.listItemMeta}>
                    <div className={styles.listItemStats}>
                      <span>
                        {t("participants.headers.score", "分數")} <strong>{participant.score ?? 0}</strong>
                      </span>
                      <span>
                        {t("participantsDashboard.violations", "違規")} {participant.violationCount}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className={styles.listPaneFooter}>
          {t("participants.listFooterCount", "顯示 {{shown}} / {{total}} 位", {
            shown: shownCount,
            total: totalCount,
          })}
        </div>
      </div>
    </ContainerCard>
  );
};

export default ParticipantsListPane;
