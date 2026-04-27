import type { ReactNode } from "react";
import {
  DataTable,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  SkeletonText,
  Tag,
} from "@carbon/react";
import { useTranslation } from "react-i18next";

import type { ContestParticipant } from "@/core/entities/contest.entity";
import {
  ListPanel,
  ListFooter,
  ListItem,
  ListItemContent,
  ListItemTitle,
  ListItemMeta,
  ListItemTrailing,
} from "@/shared/ui/list/ListPanel";
import { EmptyState } from "@/shared/ui/EmptyState";

import styles from "./ContestParticipantsDashboard.module.scss";

export type ParticipantsViewMode = "table" | "grid";

interface ParticipantsListPaneProps {
  participants: ContestParticipant[];
  totalItems?: number;
  selectedUserId?: string | null;
  loading: boolean;
  viewMode: ParticipantsViewMode;
  toolbarActions?: ReactNode;
  onSelect: (userId: string) => void;
}

const getParticipantDisplayName = (participant: ContestParticipant) =>
  participant.userDisplayName ||
  participant.displayName ||
  participant.nickname ||
  participant.username;

const getExplicitDisplayName = (participant: ContestParticipant) =>
  participant.userDisplayName ||
  participant.displayName ||
  participant.nickname ||
  "-";

const getRoleTagType = (role: string | null | undefined) => {
  switch (role) {
    case "teacher":
      return "purple";
    case "ta":
      return "teal";
    case "admin":
      return "red";
    case "student":
      return "gray";
    default:
      return "cool-gray";
  }
};

const toExamStatusTagType = (status: string | null | undefined) => {
  switch (status) {
    case "submitted":
      return "green";
    case "in_progress":
      return "blue";
    case "paused":
      return "purple";
    case "locked":
      return "red";
    default:
      return "cool-gray";
  }
};

const toConnectionTagType = (status: ContestParticipant["connectionStatus"]) => {
  switch (status) {
    case "live":
      return "cyan";
    case "online":
      return "green";
    default:
      return "cool-gray";
  }
};

const ParticipantsListPane: React.FC<ParticipantsListPaneProps> = ({
  participants,
  totalItems,
  selectedUserId,
  loading,
  viewMode,
  toolbarActions,
  onSelect,
}) => {
  const { t } = useTranslation("contest");
  const shownCount = participants.length;
  const totalCount = totalItems ?? participants.length;
  const headers = [
    { key: "participant", header: t("participants.headers.participant", "參賽者") },
    { key: "role", header: t("participants.headers.role", "身份") },
    { key: "connection", header: t("participants.headers.connection", "連線") },
    { key: "status", header: t("participants.headers.status", "狀態") },
    { key: "score", header: t("participants.headers.score", "分數") },
    { key: "violations", header: t("dashboard.violations", "違規") },
    { key: "joinedAt", header: t("participants.headers.joinedAt", "加入時間") },
  ];
  const rows = participants.map((participant) => ({
    id: participant.userId,
    participant: `${getExplicitDisplayName(participant)} ${participant.username}`,
    role: participant.accountRole || "",
    connection: participant.connectionStatus ?? "offline",
    status: participant.examStatus,
    score: String(participant.score),
    violations: String(participant.violationCount),
    joinedAt: participant.joinedAt ? new Date(participant.joinedAt).toLocaleString() : "-",
  }));

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
      ) : viewMode === "table" ? (
        <div className={styles.participantsTableWrap}>
          <DataTable rows={rows} headers={headers} size="sm">
            {({ rows: renderRows, headers: renderHeaders, getHeaderProps, getTableProps }) => (
              <TableContainer
                title={t("participants.tableTitle", "參賽者")}
                description={t("participants.tableDescription", "快速檢視參賽者狀態、連線與作答資訊")}
              >
                {toolbarActions ? (
                  <TableToolbar
                    aria-label={t("participants.tableToolbar", "參賽者表格工具列")}
                    className={styles.participantsToolbar}
                  >
                    <TableToolbarContent className={styles.participantsToolbarContent}>
                      {toolbarActions}
                    </TableToolbarContent>
                  </TableToolbar>
                ) : null}
                <Table {...getTableProps()} useZebraStyles={false}>
                  <TableHead>
                    <TableRow>
                      {renderHeaders.map((header) => (
                        <TableHeader {...getHeaderProps({ header })} key={header.key}>
                          {header.header}
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {renderRows.map((row) => {
                      const participant = participants.find((item) => item.userId === row.id);
                      if (!participant) return null;
                      const isSelected = participant.userId === selectedUserId;
                      return (
                        <TableRow
                          key={participant.userId}
                          className={`${styles.participantTableRow} ${isSelected ? styles.participantTableRowSelected : ""}`}
                          onClick={() => onSelect(participant.userId)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelect(participant.userId);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                        >
                          <TableCell>
                            <div className={styles.participantIdentityCell}>
                              <span className={styles.primaryText}>
                                {getExplicitDisplayName(participant)}
                              </span>
                              <span className={styles.secondaryText}>@{participant.username}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Tag size="sm" type={getRoleTagType(participant.accountRole)}>
                              {t(
                                `participants.roles.${participant.accountRole || "unknown"}`,
                                participant.accountRole || "-",
                              )}
                            </Tag>
                          </TableCell>
                          <TableCell>
                            <Tag size="sm" type={toConnectionTagType(participant.connectionStatus)}>
                              {t(
                                `participants.connection.${participant.connectionStatus ?? "offline"}`,
                                participant.connectionStatus ?? "offline",
                              )}
                            </Tag>
                          </TableCell>
                          <TableCell>
                            <Tag size="sm" type={toExamStatusTagType(participant.examStatus)}>
                              {t(`examStatus.${participant.examStatus}`, participant.examStatus)}
                            </Tag>
                          </TableCell>
                          <TableCell>{participant.score}</TableCell>
                          <TableCell>
                            <span className={participant.violationCount > 0 ? styles.warningText : undefined}>
                              {participant.violationCount}
                            </span>
                          </TableCell>
                          <TableCell>
                            {participant.joinedAt ? new Date(participant.joinedAt).toLocaleString() : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        </div>
      ) : (
        <div className={styles.participantGridWrap}>
          {toolbarActions ? (
            <div className={styles.gridToolbar}>{toolbarActions}</div>
          ) : null}
          <div className={styles.participantGrid}>
          {participants.map((participant) => (
            <ListItem
              key={participant.userId}
              active={participant.userId === selectedUserId}
              onClick={() => onSelect(participant.userId)}
              className={styles.participantGridCard}
            >
              <ListItemContent>
                <div className={styles.gridCardHeader}>
                  <ListItemTitle>{getParticipantDisplayName(participant)}</ListItemTitle>
                  <Tag size="sm" type={toExamStatusTagType(participant.examStatus)}>
                    {t(`examStatus.${participant.examStatus}`, participant.examStatus)}
                  </Tag>
                </div>
                <ListItemMeta>@{participant.username}</ListItemMeta>
                <div className={styles.gridCardStats}>
                  <span>
                    {t("participants.headers.score", "分數")} {participant.score}
                  </span>
                  <span
                    className={participant.violationCount > 0 ? styles.warningText : undefined}
                  >
                    {t("dashboard.violations", "違規")} {participant.violationCount}
                  </span>
                </div>
                <span className={styles.gridCardTimestamp}>
                  {participant.joinedAt ? new Date(participant.joinedAt).toLocaleString() : "-"}
                </span>
              </ListItemContent>
              <ListItemTrailing>
                <Tag
                  type="outline"
                  size="sm"
                  className={`${styles.listStatusTag} ${
                    participant.examStatus === "submitted" ? styles.listStatusTagSubmitted : ""
                  }`}
                >
                  {t("participants.openDetail", "詳情")}
                </Tag>
              </ListItemTrailing>
            </ListItem>
          ))}
          </div>
        </div>
      )}
    </ListPanel>
  );
};

export default ParticipantsListPane;
