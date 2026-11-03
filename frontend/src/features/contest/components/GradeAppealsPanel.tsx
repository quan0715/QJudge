import { useState } from "react";
import { Button, InlineNotification, SkeletonText, Tag } from "@carbon/react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { GradeAppeal } from "@/core/entities/gradeAppeal.entity";
import { useGradeAppeals } from "../hooks/useGradeAppeals";
import { BlockHeader } from "@/shared/components/dashboard";
import { formatDate } from "@/shared/utils/format";
import { Avatar } from "@/shared/ui/avatar";
import GradeAppealDialog from "./GradeAppealDialog";
import styles from "./GradeAppeals.module.scss";

export default function GradeAppealsPanel({ contestId }: { contestId: string }) {
  const { appeals, loading, error, refresh } = useGradeAppeals(contestId, true);
  const [selected, setSelected] = useState<GradeAppeal | null>(null);
  const { pathname } = useLocation();
  const { t } = useTranslation("contest");
  const gradingParams = selected ? new URLSearchParams({ panel: "grading-workbench", grading_student: String(selected.student_id), grading_question: selected.question_id }) : null;
  return <section className={styles.root} aria-label={t("gradeAppeal.manageRegion", "成績申訴管理")}>
    <BlockHeader title={t("gradeAppeal.title", "成績申訴")} titleAs="h3" actions={<Button kind="ghost" size="sm" disabled={loading} onClick={() => void refresh()}>{t("gradeAppeal.refreshList", "重新整理申訴")}</Button>} />
    {loading ? <SkeletonText paragraph lineCount={3} /> : error ? <InlineNotification kind="error" title={error} hideCloseButton lowContrast /> : <div className={styles.list}>
      {!appeals.length && <p className={styles.meta}>{t("gradeAppeal.empty", "目前沒有成績申訴。")}</p>}
      {appeals.map(appeal => <article key={appeal.id} className={styles.ticket}>
        <Avatar name={appeal.student_username} size="sm" />
        <div className={styles.ticketMain}>
          <div className={styles.byline}>
            <span className={styles.author}>{appeal.student_username}</span>
            <Tag size="sm" type="cool-gray">{appeal.question_label ?? appeal.question_order + 1}.</Tag>
            <Tag size="sm" type={appeal.status === "closed" ? "gray" : "blue"}>{appeal.status === "closed" ? t("gradeAppeal.statusClosed", "已結案") : t("gradeAppeal.statusOpen", "未結案")}</Tag>
          </div>
          <time className={styles.time} dateTime={appeal.last_message_at}>{t("gradeAppeal.lastMessage", "最後留言")} {formatDate(appeal.last_message_at, { includeSeconds: false })}</time>
        </div>
        <Button kind="ghost" size="sm" onClick={() => setSelected(appeal)}>{t("gradeAppeal.view", "查看申訴")} #{appeal.id}</Button>
      </article>)}
    </div>}
    {selected && <GradeAppealDialog key={selected.id} contestId={contestId} appealId={selected.id} questionLabel={selected.question_label} managing gradingHref={`${pathname}?${gradingParams}`} onClose={() => setSelected(null)} onChanged={() => void refresh()} />}
  </section>;
}
