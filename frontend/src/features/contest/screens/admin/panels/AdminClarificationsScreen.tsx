import { useParams } from "react-router-dom";
import { Tag } from "@carbon/react";
import ContestClarifications from "@/features/contest/components/ContestClarifications";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { useClarifications } from "@/features/contest/hooks/useClarifications";
import styles from "./AdminClarificationsPanel.module.scss";

export default function AdminClarificationsScreen() {
  const { contestId } = useParams<{ contestId: string }>();
  const { contest } = useContest();
  const { clarifications, announcements } = useClarifications(contestId ?? "");

  const unanswered = clarifications.filter((c) => !c.answer).length;

  return (
    <div className={styles.root}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={styles.title}>公告與提問</h2>
            <div className={styles.badges}>
              <Tag type="blue" size="sm">
                {announcements.length} 則公告
              </Tag>
              <Tag type={unanswered > 0 ? "red" : "green"} size="sm">
                {unanswered > 0
                  ? `${unanswered} 則待回覆`
                  : "全部已回覆"}
              </Tag>
              <Tag type="gray" size="sm">
                {clarifications.length} 則提問
              </Tag>
            </div>
          </div>
        </div>

        {contestId && contest && (
          <ContestClarifications
            contestId={contestId}
            isTeacherOrAdmin={true}
            problems={contest.problems}
            contestStatus={contest.status}
            contestEndTime={contest.endTime}
          />
        )}
      </div>
    </div>
  );
}
