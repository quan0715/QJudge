import { useState } from "react";
import { Button, InlineNotification, SkeletonText, Tag } from "@carbon/react";
import { useLocation } from "react-router-dom";
import type { GradeAppeal } from "@/core/entities/gradeAppeal.entity";
import { useGradeAppeals } from "../hooks/useGradeAppeals";
import { BlockHeader } from "@/shared/components/dashboard";
import { formatDate } from "@/shared/utils/format";
import GradeAppealDialog from "./GradeAppealDialog";
import styles from "./GradeAppeals.module.scss";

export default function GradeAppealsPanel({ contestId }: { contestId: string }) {
  const { appeals, loading, error, refresh } = useGradeAppeals(contestId, true);
  const [selected, setSelected] = useState<GradeAppeal | null>(null);
  const { pathname } = useLocation();
  const gradingParams = selected ? new URLSearchParams({ panel: "grading", grading_view: "byStudent", grading_student: String(selected.student_id), grading_question: selected.question_id }) : null;
  return <section className={styles.root} aria-label="成績申訴管理">
    <BlockHeader title="成績申訴" titleAs="h3" actions={<Button kind="ghost" size="sm" disabled={loading} onClick={() => void refresh()}>重新整理申訴</Button>} />
    {loading ? <SkeletonText paragraph lineCount={3} /> : error ? <InlineNotification kind="error" title={error} hideCloseButton lowContrast /> : <div className={styles.list}>
      {!appeals.length && <p>目前沒有成績申訴。</p>}
      {appeals.map(appeal => <article key={appeal.id} className={styles.ticket}>
        <div><strong>{appeal.student_username} · 第 {appeal.question_order + 1} 題</strong><p className={styles.meta}>{formatDate(appeal.last_message_at, { includeSeconds: false })}</p></div>
        <div className={styles.actions}><Tag type={appeal.status === "closed" ? "gray" : "blue"}>{appeal.status === "closed" ? "已結案" : "未結案"}</Tag><Button kind="tertiary" size="sm" onClick={() => setSelected(appeal)}>查看申訴 #{appeal.id}</Button></div>
      </article>)}
    </div>}
    {selected && <GradeAppealDialog key={selected.id} contestId={contestId} appealId={selected.id} managing gradingHref={`${pathname}?${gradingParams}`} onClose={() => setSelected(null)} onChanged={() => void refresh()} />}
  </section>;
}
