import {
  SkeletonText,
  Tag,
} from "@carbon/react";
import { useTranslation } from "react-i18next";

import type { ContestParticipant } from "@/core/entities/contest.entity";
import {
  ListPanel,
  ListHeader,
  ListFooter,
  ListItem,
  ListItemContent,
  ListItemTitle,
  ListItemMeta,
  ListItemTrailing,
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
    <ListPanel
      className={styles.listPaneCard}
      header={
        <ListHeader title={t("participants.listHeaderTitle", "學生列表")} />
      }
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
            <div key={row} style={{ padding: "0.625rem 0.75rem" }}>
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
        participants.map((participant) => (
          <ListItem
            key={participant.userId}
            active={participant.userId === selectedUserId}
            onClick={() => onSelect(participant.userId)}
          >
            <ListItemContent>
              <ListItemTitle>
                {participant.userDisplayName ||
                  participant.displayName ||
                  participant.nickname ||
                  participant.username}
              </ListItemTitle>
              <ListItemMeta>@{participant.username}</ListItemMeta>
            </ListItemContent>
            <ListItemTrailing>
              <Tag
                type="outline"
                size="sm"
                className={`${styles.listStatusTag} ${
                  participant.examStatus === "submitted" ? styles.listStatusTagSubmitted : ""
                }`}
              >
                {t(`examStatus.${participant.examStatus}`, participant.examStatus)}
              </Tag>
            </ListItemTrailing>
          </ListItem>
        ))
      )}
    </ListPanel>
  );
};

export default ParticipantsListPane;
