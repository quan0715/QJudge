import React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  Tag,
} from "@carbon/react";
import { Download, Report } from "@carbon/icons-react";
import type {
  ClassroomGradebook,
  ClassroomGradebookContest,
} from "@/core/entities/classroom.entity";
import { formatDate } from "@/i18n/dateUtils";
import { EmptyState } from "@/shared/ui/EmptyState";
import { formatScore } from "@/shared/utils/scoreFormat";
import styles from "./GradebookTable.module.scss";

interface GradebookTableProps {
  gradebook: ClassroomGradebook;
  onExport: () => void;
  exporting: boolean;
}

const ContestColumnHeader: React.FC<{ contest: ClassroomGradebookContest }> = ({
  contest,
}) => {
  const { t } = useTranslation("classroom");
  const isCoding = contest.contestType === "coding";
  const dateLabel = formatDate(contest.startTime);

  return (
    <div className={styles.contestHeader}>
      <Tag
        type={isCoding ? "blue" : "green"}
        size="sm"
        className={styles.typeTag}
      >
        {isCoding
          ? t("gradebook.typeCoding", "程式")
          : t("gradebook.typePaperExam", "考卷")}
      </Tag>
      <span className={styles.contestName}>{contest.name}</span>
      <span className={styles.contestMeta}>
        {dateLabel && (
          <>
            <span>{dateLabel}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>
          {t("gradebook.maxScore", "滿分 {{score}}", {
            score: formatScore(contest.maxScore),
          })}
        </span>
      </span>
    </div>
  );
};

export const GradebookTable: React.FC<GradebookTableProps> = ({
  gradebook,
  onExport,
  exporting,
}) => {
  const { t } = useTranslation("classroom");
  const { contests, students } = gradebook;
  const isEmpty = contests.length === 0 || students.length === 0;

  return (
    <TableContainer
      title={t("gradebook.title", "成績總表")}
      description={t("gradebook.summary", "學生 {{students}} 人 · 考試 {{contests}} 場", {
        students: students.length,
        contests: contests.length,
      })}
    >
      <TableToolbar aria-label={t("gradebook.title", "成績總表")}>
        <TableToolbarContent>
          <Button
            kind="primary"
            renderIcon={Download}
            disabled={isEmpty || exporting}
            onClick={onExport}
          >
            {t("gradebook.export", "匯出 CSV")}
          </Button>
        </TableToolbarContent>
      </TableToolbar>
      {isEmpty ? (
        <EmptyState
          icon={Report}
          description={t("gradebook.empty", "目前沒有學生或考試")}
        />
      ) : (
        <div className={styles.scroll}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader
                  className={`${styles.stickyHead} ${styles.accountColumn}`}
                >
                  {t("gradebook.colUsername", "帳號")}
                </TableHeader>
                <TableHeader
                  className={`${styles.stickyHead} ${styles.nameColumn}`}
                >
                  {t("gradebook.colDisplayName", "姓名")}
                </TableHeader>
                {contests.map((contest) => (
                  <TableHeader key={contest.id} className={styles.contestColumn}>
                    <ContestColumnHeader contest={contest} />
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.userId} className={styles.row}>
                  <TableCell
                    className={`${styles.stickyCell} ${styles.accountColumn}`}
                    title={student.username}
                  >
                    {student.username}
                  </TableCell>
                  <TableCell
                    className={`${styles.stickyCell} ${styles.nameColumn}`}
                    title={student.displayName || undefined}
                  >
                    {student.displayName}
                  </TableCell>
                  {contests.map((contest) => {
                    const score = student.scores[contest.id] ?? null;
                    return (
                      <TableCell key={contest.id}>
                        <span className={styles.score}>
                          {score === null ? (
                            <span
                              role="img"
                              aria-label={t("gradebook.notAttempted", "未參加")}
                            >
                              —
                            </span>
                          ) : (
                            formatScore(score)
                          )}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </TableContainer>
  );
};
