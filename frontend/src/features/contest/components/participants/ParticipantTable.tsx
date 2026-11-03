import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";

import type { ContestParticipant } from "@/core/entities/contest.entity";
import { getParticipantDisplayName, isParticipantLive } from "@/features/contest/domain/participantRoster";
import { formatScore } from "@/shared/utils/scoreFormat";
import styles from "./ParticipantTable.module.scss";

type SortKey = "name" | "username" | "status" | "connection" | "score" | "violations";
type SortDirection = "NONE" | "ASC" | "DESC";

const NEXT_DIRECTION: Record<SortDirection, SortDirection> = { NONE: "ASC", ASC: "DESC", DESC: "NONE" };

const STATUS_TAG_TYPE: Record<string, "green" | "blue" | "purple" | "red"> = {
  submitted: "green",
  in_progress: "blue",
  paused: "purple",
  locked: "red",
};

const connectionRank = (participant: ContestParticipant) =>
  isParticipantLive(participant) ? 2 : participant.connectionStatus === "online" ? 1 : 0;

const sortValue = (participant: ContestParticipant, key: SortKey): string | number => {
  switch (key) {
    case "name":
      return getParticipantDisplayName(participant);
    case "username":
      return participant.username;
    case "status":
      return participant.examStatus ?? "";
    case "connection":
      return connectionRank(participant);
    case "score":
      return participant.score ?? 0;
    case "violations":
      return participant.violationCount ?? 0;
  }
};

interface ParticipantTableProps {
  participants: ContestParticipant[];
  showViolations: boolean;
  onSelect: (userId: string) => void;
}

export default function ParticipantTable({ participants, showViolations, onSelect }: ParticipantTableProps) {
  const { t } = useTranslation("contest");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "name", direction: "NONE" });

  const rows = useMemo(() => {
    if (sort.direction === "NONE") return participants;
    const factor = sort.direction === "ASC" ? 1 : -1;
    return [...participants].sort((left, right) => {
      const a = sortValue(left, sort.key);
      const b = sortValue(right, sort.key);
      const diff = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "zh-TW");
      return diff * factor;
    });
  }, [participants, sort]);

  const headers: Array<{ key: SortKey; label: string }> = [
    { key: "name", label: t("participants.headers.name", "姓名") },
    { key: "username", label: t("participants.headers.username", "帳號") },
    { key: "status", label: t("participants.headers.status", "狀態") },
    { key: "connection", label: t("participants.headers.connection", "連線") },
    { key: "score", label: t("participants.headers.score", "分數") },
    ...(showViolations ? [{ key: "violations" as const, label: t("participants.headers.violations", "違規") }] : []),
  ];

  const connectionLabel = (participant: ContestParticipant) =>
    isParticipantLive(participant)
      ? t("participants.connection.live", "Live")
      : participant.connectionStatus === "online"
        ? t("participants.connection.online", "在線")
        : t("participants.connection.offline", "離線");

  return (
    <Table size="md" useZebraStyles={false}>
      <TableHead>
        <TableRow>
          {headers.map((header) => (
            <TableHeader
              key={header.key}
              isSortable
              isSortHeader={sort.key === header.key}
              sortDirection={sort.key === header.key ? sort.direction : "NONE"}
              onClick={() =>
                setSort((current) => ({
                  key: header.key,
                  direction: current.key === header.key ? NEXT_DIRECTION[current.direction] : "ASC",
                }))
              }
            >
              {header.label}
            </TableHeader>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((participant) => (
          <TableRow
            key={participant.userId}
            tabIndex={0}
            className={styles.row}
            onClick={() => onSelect(participant.userId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(participant.userId);
              }
            }}
          >
            <TableCell>{getParticipantDisplayName(participant)}</TableCell>
            <TableCell>{participant.username}</TableCell>
            <TableCell>
              {participant.examStatus ? (
                <Tag size="sm" type={STATUS_TAG_TYPE[participant.examStatus] ?? "cool-gray"}>
                  {t(`examStatus.${participant.examStatus}`, participant.examStatus)}
                </Tag>
              ) : null}
            </TableCell>
            <TableCell>{connectionLabel(participant)}</TableCell>
            <TableCell>{formatScore(participant.score ?? 0)}</TableCell>
            {showViolations ? <TableCell>{participant.violationCount ?? 0}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
