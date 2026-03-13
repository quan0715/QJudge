import {
  Button,
  FluidDropdown,
  FluidSearch,
  Layer,
  Popover,
  PopoverContent,
  SkeletonText,
  Tag,
} from "@carbon/react";
import { Add, Filter, Renew } from "@carbon/icons-react";
import { useMemo, useState } from "react";
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
  totalItems: number;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onSelect: (userId: string) => void;
  onAddParticipant: () => void;
  onRefreshParticipants: () => void;
  isRefreshingParticipants?: boolean;
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

const ParticipantsListPane: React.FC<ParticipantsListPaneProps> = ({
  participants,
  selectedUserId,
  loading,
  searchQuery,
  statusFilter,
  statusOptions,
  sortKey,
  sortOptions,
  totalItems,
  onSearchChange,
  onStatusFilterChange,
  onSortChange,
  onSelect,
  onAddParticipant,
  onRefreshParticipants,
  isRefreshingParticipants = false,
}) => {
  const { t } = useTranslation("contest");
  type Option = { id: string; label: string };
  const [filterOpen, setFilterOpen] = useState(false);
  const hasActiveFilters = useMemo(
    () =>
      searchQuery.trim().length > 0 ||
      statusFilter !== "all" ||
      sortKey !== "score_desc",
    [searchQuery, sortKey, statusFilter],
  );

  return (
    <ContainerCard
      title={t("participants.title", "參賽者列表")}
      className={styles.pane}
      noPadding
      action={
        <div className={styles.listActions}>
          <Button
            kind="ghost"
            size="md"
            data-testid="participants-list-refresh-btn"
            renderIcon={Renew}
            iconDescription={t("common.refresh", "重新整理")}
            disabled={isRefreshingParticipants}
            onClick={onRefreshParticipants}
          >
            {t("common.refresh", "重新整理")}
          </Button>
          <Layer>
            <Popover
              open={filterOpen}
              align="bottom-left"
              onRequestClose={() => setFilterOpen(false)}
            >
              <Button
                kind={hasActiveFilters ? "primary" : "ghost"}
                size="md"
                hasIconOnly
                renderIcon={Filter}
                iconDescription={t("participants.filters", "篩選")}
                data-testid="participants-list-filter-btn"
                onClick={() => setFilterOpen((prev) => !prev)}
              />
              <PopoverContent className={styles.filterPopoverContent}>
                <div className={styles.filterPopoverFields}>
                  <FluidSearch
                    id="participants-dashboard-search"
                    labelText={t("participants.searchLabel", "搜尋參賽者")}
                    placeholder={t("participants.searchPlaceholder", "搜尋姓名或使用者 ID...")}
                    value={searchQuery}
                    onChange={(event) => onSearchChange(event.target.value)}
                  />
                  <FluidDropdown
                    id="participants-dashboard-status"
                    titleText={t("participants.selectStatus", "狀態")}
                    label={t("participants.selectStatus", "狀態")}
                    items={statusOptions}
                    itemToString={(item) => (item as Option | null)?.label ?? ""}
                    selectedItem={statusOptions.find((item) => item.id === statusFilter) ?? null}
                    onChange={({ selectedItem }) =>
                      onStatusFilterChange((selectedItem as Option | null)?.id ?? "all")
                    }
                  />
                  <FluidDropdown
                    id="participants-dashboard-sort"
                    titleText={t("participantsDashboard.sortLabel", "排序")}
                    label={t("participantsDashboard.sortLabel", "排序")}
                    items={sortOptions}
                    itemToString={(item) => (item as Option | null)?.label ?? ""}
                    selectedItem={sortOptions.find((item) => item.id === sortKey) ?? null}
                    onChange={({ selectedItem }) =>
                      onSortChange((selectedItem as Option | null)?.id ?? "score_desc")
                    }
                  />
                </div>
                <div className={styles.filterPopoverActions}>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => {
                      onSearchChange("");
                      onStatusFilterChange("all");
                      onSortChange("score_desc");
                    }}
                  >
                    {t("common.reset", "重設")}
                  </Button>
                  <Button
                    kind="primary"
                    size="sm"
                    onClick={() => setFilterOpen(false)}
                  >
                    {t("common.done", "完成")}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </Layer>
          <Button
            kind="primary"
            size="md"
            data-testid="participants-list-add-btn"
            renderIcon={Add}
            iconDescription={t("participants.add", "新增")}
            hasIconOnly
            onClick={onAddParticipant}
          />
        </div>
      }
    >
      <div className={styles.paneInner}>
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
                        {participant.userDisplayName ||
                          participant.displayName ||
                          participant.nickname ||
                          participant.username}
                      </span>
                      <span className={styles.secondaryText}>@{participant.username}</span>
                    </div>
                    <Tag type={toTagType(participant.examStatus)} size="sm">
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
      </div>
    </ContainerCard>
  );
};

export default ParticipantsListPane;
