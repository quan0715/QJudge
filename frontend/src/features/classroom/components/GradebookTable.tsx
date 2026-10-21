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
} from "@carbon/react";
import { Download, Report } from "@carbon/icons-react";
import type { ClassroomGradebook } from "@/core/entities/classroom.entity";
import { EmptyState } from "@/shared/ui/EmptyState";
import { formatScore } from "@/shared/utils/scoreFormat";
import styles from "./GradebookTable.module.scss";

interface GradebookTableProps {
  gradebook: ClassroomGradebook;
  onExport: () => void;
  exporting: boolean;
}

const averageScore = (
  gradebook: ClassroomGradebook,
  contestId: string,
): number | null => {
  const scores = gradebook.students
    .map((student) => student.scores[contestId] ?? null)
    .filter((score): score is number => score !== null);
  if (scores.length === 0) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
};

export const GradebookTable: React.FC<GradebookTableProps> = ({
  gradebook,
  onExport,
  exporting,
}) => {
  const { t } = useTranslation("classroom");
  const { contests, students } = gradebook;
  const isEmpty = contests.length === 0 || students.length === 0;
  const notAttempted = (
    <span role="img" aria-label={t("gradebook.notAttempted", "未參加")}>
      —
    </span>
  );

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
                    <span className={styles.contestName}>{contest.name}</span>
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
                          {score === null ? notAttempted : formatScore(score)}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              <TableRow className={`${styles.row} ${styles.averageRow}`}>
                <TableCell className={`${styles.stickyCell} ${styles.accountColumn}`}>
                  {t("gradebook.average", "平均")}
                </TableCell>
                <TableCell className={`${styles.stickyCell} ${styles.nameColumn}`} />
                {contests.map((contest) => {
                  const average = averageScore(gradebook, contest.id);
                  return (
                    <TableCell key={contest.id}>
                      <span className={styles.score}>
                        {average === null ? notAttempted : formatScore(average)}
                      </span>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </TableContainer>
  );
};
