import { useCallback, useEffect, useRef, useState } from "react";
import { Button, InlineNotification, Modal, SkeletonText, Tag, TextArea } from "@carbon/react";
import type { GradeAppealDetail } from "@/core/entities/gradeAppeal.entity";
import { closeGradeAppeal, createGradeAppeal, getGradeAppeal, sendGradeAppealMessage } from "@/infrastructure/api/repositories/gradeAppeals.repository";
import { EnvelopeError } from "@/infrastructure/api/envelope";
import { useToast } from "@/shared/contexts/ToastContext";
import { formatDate } from "@/shared/utils/format";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import AnswerDisplay from "./exam/AnswerDisplay";
import { formatScore } from "../utils/scoreFormat";
import styles from "./GradeAppeals.module.scss";

interface Props {
  contestId: string;
  appealId?: number;
  answerId?: number;
  questionPrompt?: string;
  managing: boolean;
  gradingHref?: string;
  onClose: () => void;
  onChanged: () => void;
}

export default function GradeAppealDialog({ contestId, appealId, answerId, questionPrompt, managing, gradingHref, onClose, onChanged }: Props) {
  const [ticket, setTicket] = useState<GradeAppealDetail | null>(null);
  const [currentId, setCurrentId] = useState(appealId);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(!!appealId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const { showToast } = useToast();
  const load = useCallback(async (id: number) => {
    const version = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const data = await getGradeAppeal(contestId, id);
      if (version === generation.current) setTicket(data);
    } catch (e) {
      if (version === generation.current) {
        setTicket(null);
        setError(e instanceof Error ? e.message : "申訴載入失敗，請重新整理。");
      }
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [contestId]);
  useEffect(() => {
    if (appealId) void load(appealId);
    return () => { generation.current += 1; };
  }, [appealId, load]);

  const send = async () => {
    if (saving || !draft.trim() || Array.from(draft.trim()).length > 5000) return;
    setSaving(true);
    try {
      const data = currentId
        ? await sendGradeAppealMessage(contestId, currentId, draft.trim())
        : await createGradeAppeal(contestId, answerId!, draft.trim());
      setTicket(data);
      setCurrentId(data.id);
      if (!("created" in data) || data.created) {
        setDraft("");
      } else {
        showToast({ kind: "info", title: "此題已有申訴", subtitle: "已保留草稿，請確認對話後送出留言。" });
      }
      setError("");
      onChanged();
    } catch (e) {
      showToast({ kind: "error", title: "留言未送出", subtitle: e instanceof Error ? e.message : "請稍後再試。" });
      if (e instanceof EnvelopeError && [403, 404].includes(e.status)) {
        setTicket(null);
        setError(e.message);
      } else if (e instanceof EnvelopeError && e.status === 409 && currentId) {
        await load(currentId);
      }
    } finally { setSaving(false); }
  };
  const close = async () => {
    if (!currentId || saving) return;
    setSaving(true);
    try {
      setTicket(await closeGradeAppeal(contestId, currentId));
      setDraft("");
      onChanged();
      showToast({ kind: "success", title: "申訴已結案" });
    } catch (e) {
      showToast({ kind: "error", title: "結案失敗", subtitle: e instanceof Error ? e.message : "請稍後再試。" });
      if (e instanceof EnvelopeError && [403, 404].includes(e.status)) {
        setTicket(null);
        setError(e.message);
      }
    } finally { setSaving(false); }
  };
  const tooLong = Array.from(draft.trim()).length > 5000;
  return (
    <Modal open passiveModal modalHeading="成績申訴" size="lg" onRequestClose={onClose} preventCloseOnClickOutside>
      <div className={styles.root}>
        <div className={styles.actions}>
          {ticket && <Tag type={ticket.status === "closed" ? "gray" : "blue"}>{ticket.status === "closed" ? "已結案" : "未結案"}</Tag>}
          {currentId && <Button kind="ghost" size="sm" disabled={loading || saving} onClick={() => void load(currentId)}>重新整理留言</Button>}
          {managing && gradingHref && <Button kind="tertiary" size="sm" href={gradingHref}>前往批改</Button>}
        </div>
        {loading ? <SkeletonText paragraph lineCount={4} /> : error ? (
          <InlineNotification kind="error" title={error} hideCloseButton lowContrast />
        ) : <>
          <section className={styles.context} aria-label="申訴題目與作答">
            <MarkdownRenderer>{ticket?.question_prompt ?? questionPrompt ?? "請說明這題需要重新檢視的部分。"}</MarkdownRenderer>
            {ticket && <>
              <p>考生：{ticket.student_username} · 目前成績：{formatScore(ticket.current_score)} / {formatScore(ticket.current_max_score)}</p>
              <AnswerDisplay questionType={ticket.answer.question_type} answerFormat={ticket.answer_format} answerContent={ticket.answer.answer} options={ticket.answer.question_options} correctAnswer={null} showCorrectness={false} />
              {ticket.answer.feedback && <div><strong>批改評語</strong><MarkdownRenderer>{ticket.answer.feedback}</MarkdownRenderer></div>}
            </>}
          </section>
          {ticket && <section aria-label="申訴對話" className={styles.messages}>
            {ticket.messages.map(message => <article className={styles.message} key={message.id}>
              <p className={styles.meta}>{message.author_username} · {formatDate(message.created_at, { includeSeconds: true })}</p>
              <p className={styles.content}>{message.content}</p>
            </article>)}
          </section>}
          {ticket?.status === "closed" ? <p role="status">此申訴已結案，可查閱對話。</p> : <>
            <TextArea id="grade-appeal-message" labelText={currentId ? "留言內容" : "申訴理由"} helperText="限 5000 字；補充說明會保留在同一件申訴中。" value={draft} onChange={e => setDraft(e.target.value)} invalid={tooLong} invalidText="請將訊息縮短至 5000 字內。" rows={4} disabled={saving} />
            <div className={styles.actions}>
              <Button size="sm" disabled={saving || !draft.trim() || tooLong} onClick={() => void send()}>{saving ? "處理中…" : currentId ? "送出留言" : "送出申訴"}</Button>
              {managing && currentId && <Button kind="tertiary" size="sm" disabled={saving} onClick={() => void close()}>結案</Button>}
            </div>
          </>}
        </>}
      </div>
    </Modal>
  );
}
