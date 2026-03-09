import {
  Button,
  FluidDropdown,
  FluidSearch,
  Pagination,
  SkeletonText,
  Tag,
} from "@carbon/react";
import { Add } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type { ContestParticipant } from "@/core/entities/contest.entity";
import ContainerCard from "@/shared/layout/ContainerCard";

import styles from "./ContestParticipantsDashboard.module.scss";

interface ParticipantsListPaneProps {
  participants: ContestParticipant[];
  selectedUserId?: string | null;
  loading: boolean;
  searchQuery: string;
  statusFilter: string;
  statusOptions: Array<{ id: string; label: string }>;
  sortKey: string;
  sortOptions: Array<{ id: string; label: string }>;
  page: number;
  pageSize: number;
  totalItems: number;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
  onSelect: (userId: string) => void;
  onAddParticipant: () => void;
  getRecentActivity: (userId: string) => string | null;
}

const toTagType = (status: ContestParticipant["examStatus"]) => {
  switch (status) {
    case "submitted":
      return "green";
    case "in_progress":
      return "blue";
    case "paused":
      return "purple";
    case "locked":
    case "locked_takeover":
      return "red";
    default:
      return "cool-gray";
  }
};

const formatRecentActivity = (timestamp: string) =>
  new Date(timestamp).toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const ParticipantsListPane: React.FC<ParticipantsListPaneProps> = ({
  participants,
  selectedUserId,
  loading,
  searchQuery,
  statusFilter,
  statusOptions,
  sortKey,
  sortOptions,
  page,
  pageSize,
  totalItems,
  onSearchChange,
  onStatusFilterChange,
  onSortChange,
  onPageChange,
  onSelect,
  onAddParticipant,
  getRecentActivity,
}) => {
  const { t } = useTranslation("contest");

  return (
    <ContainerCard
      title={t("participants.title", "參賽者列表")}
      className={styles.pane}
      noPadding
      action={
        <Button
          kind="primary"
          size="sm"
          renderIcon={Add}
          iconDescription={t("participants.add", "新增")}
          hasIconOnly
          onClick={onAddParticipant}
        />
      }
    >
      <div className={styles.paneInner}>
      <div className={styles.toolbarSearch}>
        <FluidSearch
          id="participants-dashboard-search"
          labelText={t("participants.searchLabel", "搜尋參賽者")}
          placeholder={t("participants.searchPlaceholder", "搜尋姓名或使用者 ID...")}
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <div className={styles.toolbar}>
        <FluidDropdown
          id="participants-dashboard-status"
          titleText={t("participants.selectStatus", "狀態")}
          label={t("participants.selectStatus", "狀態")}
          items={statusOptions}
          itemToString={(item) => item?.label ?? ""}
          selectedItem={statusOptions.find((item) => item.id === statusFilter) ?? null}
          onChange={({ selectedItem }) => onStatusFilterChange(selectedItem?.id ?? "all")}
        />
        <FluidDropdown
          id="participants-dashboard-sort"
          titleText={t("participantsDashboard.sortLabel", "排序")}
          label={t("participantsDashboard.sortLabel", "排序")}
          items={sortOptions}
          itemToString={(item) => item?.label ?? ""}
          selectedItem={sortOptions.find((item) => item.id === sortKey) ?? null}
          onChange={({ selectedItem }) => onSortChange(selectedItem?.id ?? "score_desc")}
        />
      </div>

      <div className={styles.toolbarMeta}>
        <span>
          {t("participants.displayCount", {
            shown: participants.length,
            total: totalItems,
          })}
        </span>
      </div>

      <div className={`${styles.scrollPane} ${styles.list}`}>
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
                      {participant.displayName || participant.nickname || participant.username}
                    </span>
                    <span className={styles.secondaryText}>@{participant.username}</span>
                  </div>
                  <Tag type={toTagType(participant.examStatus)}>
                    {t(`examStatus.${participant.examStatus}`, participant.examStatus)}
                  </Tag>
                </div>

                <div className={styles.listItemMeta}>
                  <div className={styles.listItemStats}>
                    <span>{t("participants.headers.score", "分數")} <strong>{participant.score ?? 0}</strong></span>
                    <span>{t("participantsDashboard.violations", "違規")} {participant.violationCount}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.paginationWrap}>
        <Pagination
          page={page}
          pageSize={pageSize}
          pageSizes={[10, 20, 50, 100]}
          totalItems={totalItems}
          backwardText={t("common.prevPage", "上一頁")}
          forwardText={t("common.nextPage", "下一頁")}
          itemsPerPageText={t("common.itemsPerPage", "每頁")}
          onChange={({ page: nextPage, pageSize: nextPageSize }) =>
            onPageChange(nextPage, nextPageSize)
          }
        />
      </div>
      </div>
    </ContainerCard>
  );
};

export default ParticipantsListPane;
