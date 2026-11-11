import { useState } from "react";
import { Accordion, AccordionItem, InlineNotification, SkeletonText, Tag } from "@carbon/react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useGradeAppeals } from "../hooks/useGradeAppeals";
import { BlockHeader } from "@/shared/ui/dashboard";
import { formatDate } from "@/shared/utils/format";
import { Avatar } from "@/shared/ui/avatar";
import GradeAppealDialog from "./GradeAppealDialog";
import GradeAppealStatusTag from "./GradeAppealStatusTag";
import styles from "./GradeAppeals.module.scss";

export default function GradeAppealsPanel({ contestId, refreshKey = 0 }: { contestId: string; refreshKey?: number }) {
  const { appeals, loading, error, updateAppeal } = useGradeAppeals(contestId, true, refreshKey);
  const [visited, setVisited] = useState<Set<number>>(() => new Set());
  const { pathname } = useLocation();
  const { t } = useTranslation("contest");

  return <section className={styles.root} aria-label={t("gradeAppeal.manageRegion", "成績申訴管理")} aria-busy={loading}>
    <BlockHeader title={t("gradeAppeal.title", "成績申訴")} titleAs="h3" />
    {error && <InlineNotification kind="error" title={error} hideCloseButton lowContrast />}
    {loading && !appeals.length ? <SkeletonText paragraph lineCount={3} /> : <>
      {!appeals.length && !error && <p className={styles.meta}>{t("gradeAppeal.empty", "目前沒有成績申訴。")}</p>}
      <Accordion align="start" className={styles.list}>
        {appeals.map(appeal => {
          const gradingParams = new URLSearchParams({ panel: "grading-workbench", grading_student: String(appeal.student_id), grading_question: appeal.question_id });
          return <AccordionItem key={`${contestId}-${appeal.id}`} title={<span className={styles.ticket}>
            <Avatar identity={appeal.student_id} name={appeal.student_username} url={appeal.student_avatar_url ?? undefined} size="sm" />
            <span className={styles.ticketMain}>
              <span className={styles.byline}>
                <span className={styles.author}>{appeal.student_username}</span>
                <Tag size="sm" type="cool-gray">{appeal.question_label ?? appeal.question_order + 1}.</Tag>
                <GradeAppealStatusTag appeal={appeal} />
              </span>
              <time className={styles.time} dateTime={appeal.last_message_at}>{t("gradeAppeal.lastMessage", "最後留言")} {formatDate(appeal.last_message_at, { includeSeconds: false })}</time>
            </span>
          </span>} onHeadingClick={({ isOpen }) => {
            if (isOpen) setVisited(current => new Set(current).add(appeal.id));
          }}>
            {visited.has(appeal.id) && <GradeAppealDialog contestId={contestId} appealId={appeal.id} questionLabel={appeal.question_label} managing inline refreshKey={refreshKey} gradingHref={`${pathname}?${gradingParams}`} onClose={() => {}} onChanged={updateAppeal} />}
          </AccordionItem>;
        })}
      </Accordion>
    </>}
  </section>;
}
