import { Accordion, AccordionItem } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { lazy, Suspense, useState } from "react";
import type { ContestDetail } from "@/core/entities/contest.entity";
const ContestProblemSubmissions = lazy(() => import("../solver/submissions/ContestProblemSubmissions"));
import { formatScore } from "../../utils/scoreFormat";
import { SubmissionVerdictTag } from "@/shared/ui/submission/SubmissionVerdictTag";
import styles from "./CodingAnswerRecords.module.scss";

export default function CodingAnswerRecords({ contest }: { contest: ContestDetail }) {
  const { t } = useTranslation("contest");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const label = (key: string) => t(`studentDashboard.codingRecords.${key}`);

  if (!contest.problems.length) return <p>{t("studentDashboard.empty.noQuestions")}</p>;

  return (
    <div className={styles.root}>
      <div className={styles.columns} aria-hidden="true">
        <span>{label("problem")}</span><span>{label("score")}</span>
        <span>{label("status")}</span><span>{label("count")}</span>
      </div>
      <Accordion align="end">
        {contest.problems.map((problem) => (
          <AccordionItem key={problem.id} open={expanded.has(problem.id)}
            onHeadingClick={({ isOpen }) => setExpanded((previous) => {
              const next = new Set(previous);
              if (isOpen) next.add(problem.id); else next.delete(problem.id);
              return next;
            })}
            title={<span className={styles.summary}>
              <span className={styles.title}>{problem.label}. {problem.title}</span>
              <span>
                {problem.userScore == null ? "—" : formatScore(problem.userScore)} / {formatScore(problem.maxScore ?? 0)}
              </span>
              <SubmissionVerdictTag className={styles.badge} status={problem.userStatus ?? "NS"} />
              <span><span className={styles.mobileLabel}>{label("count")}：</span>{problem.submissionCount ?? "—"}</span>
            </span>}>
            {expanded.has(problem.id) && <Suspense fallback={<p>{t("studentDashboard.loadingAnswers")}</p>}><ContestProblemSubmissions contestId={contest.id} codingProblemId={problem.problemId} /></Suspense>}
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
