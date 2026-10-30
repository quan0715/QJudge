import { useCallback, useEffect, useRef, useState } from "react";
import { Button, InlineNotification, Modal, SkeletonText, Tag, TextArea } from "@carbon/react";
import { Locked } from "@carbon/icons-react";
import type { GradeAppealDetail } from "@/core/entities/gradeAppeal.entity";
import { closeGradeAppeal, createGradeAppeal, getGradeAppeal, reopenGradeAppeal, sendGradeAppealMessage } from "@/infrastructure/api/repositories/gradeAppeals.repository";
import { EnvelopeError } from "@/infrastructure/api/envelope";
import { useToast } from "@/shared/contexts/ToastContext";
import { formatDate } from "@/shared/utils/format";
import { Avatar } from "@/shared/ui/avatar";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import AnswerDisplay from "./exam/AnswerDisplay";
import { formatScore } from "../utils/scoreFormat";
import styles from "./GradeAppeals.module.scss";

interface Props {
  contestId: string;
  appealId?: number;
  answerId?: number;
  questionPrompt?: string;
  questionLabel?: string;
  managing: boolean;
  gradingHref?: string;
  onClose: () => void;
  onChanged: () => void;
}

export default function GradeAppealDialog({ contestId, appealId, answerId, questionPrompt, questionLabel, managing, gradingHref, onClose, onChanged }: Props) {
  const [ticket, setTicket] = useState<GradeAppealDetail | null>(null);
  const [currentId, setCurrentId] = useState(appealId);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(!!appealId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const { showToast } = useToast();
  const { user } = useAuth();
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

  const reopening = ticket?.status === "closed" && !managing;
  const send = async () => {
    if (saving || !draft.trim() || Array.from(draft.trim()).length > 5000) return;
    setSaving(true);
    try {
      const data = currentId
        ? reopening
          ? await reopenGradeAppeal(contestId, currentId, draft.trim())
          : await sendGradeAppealMessage(contestId, currentId, draft.trim())
        : await createGradeAppeal(contestId, answerId!, draft.trim());
      setTicket(data);
      setCurrentId(data.id);
      if (!("created" in data) || data.created) {
        setDraft("");
      } else {
        showToast({ kind: "info", title: "此題已有申訴", subtitle: "已保留草稿，請確認對話後送出留言。" });
      }
      setError("");
      if (reopening) showToast({ kind: "success", title: "申訴已重新開啟" });
      onChanged();
    } catch (e) {
      showToast({ kind: "error", title: reopening ? "重開申訴失敗" : "留言未送出", subtitle: e instanceof Error ? e.message : "請稍後再試。" });
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
  const displayLabel = ticket?.question_label ?? questionLabel ?? (ticket ? String(ticket.question_order + 1) : undefined);
  const tooLong = Array.from(draft.trim()).length > 5000;
  const closed = ticket?.status === "closed";
  return (
    <Modal open passiveModal modalHeading={displayLabel ? `成績申訴 · ${displayLabel}.` : "成績申訴"} size="lg" onRequestClose={onClose} preventCloseOnClickOutside>
      <div className={`${styles.root} ${styles.dialogContent}`}>
        <div className={styles.toolbar}>
          {ticket && <Tag size="sm" type={closed ? "gray" : "blue"}>{closed ? "已結案" : "未結案"}</Tag>}
          {ticket && <span className={styles.meta}>{ticket.student_username} · 目前成績 {formatScore(ticket.current_score)} / {formatScore(ticket.current_max_score)}</span>}
          <span className={styles.toolbarActions}>
            {currentId && <Button kind="ghost" size="sm" disabled={loading || saving} onClick={() => void load(currentId)}>重新整理留言</Button>}
            {managing && gradingHref && <Button kind="tertiary" size="sm" href={gradingHref}>前往批改</Button>}
          </span>
        </div>
        <p className={styles.meta}>{managing
          ? "請依交卷時的原答案與相同評分規則複核；不得要求補作答或以新增內容給分。"
          : "請說明交卷時的原答案，或指出可能漏評、誤判的部分；不得補作答。"}</p>
        {loading ? <SkeletonText paragraph lineCount={4} /> : error ? (
          <InlineNotification kind="error" title={error} hideCloseButton lowContrast />
        ) : <>
          <section className={styles.context} aria-label="申訴題目與作答">
            <h4 className={styles.sectionTitle}>題目</h4>
            <MarkdownRenderer>{ticket?.answer.question_prompt ?? ticket?.question_prompt ?? questionPrompt ?? "請說明這題需要重新檢視的部分。"}</MarkdownRenderer>
            {ticket && <>
              <AnswerDisplay questionType={ticket.answer.question_type} answerFormat={ticket.answer_format} answerContent={ticket.answer.answer} options={ticket.answer.question_options} correctAnswer={null} showCorrectness={false} />
              {ticket.answer.feedback && <div className={styles.feedback}>
                <h4 className={styles.sectionTitle}>批改評語</h4>
                <MarkdownRenderer>{ticket.answer.feedback}</MarkdownRenderer>
              </div>}
            </>}
          </section>
          <section aria-label="申訴對話" className={styles.conversation}>
            <h4 className={styles.sectionTitle}>申訴對話{ticket ? ` · ${ticket.messages.length}` : ""}</h4>
            <ol className={styles.thread}>
              {ticket?.messages.map(message => {
                const fromStudent = message.author_id === ticket.student_id;
                return <li className={styles.post} key={message.id}>
                  <div className={styles.rail}><Avatar name={message.author_username} size="sm" /></div>
                  <div className={styles.body}>
                    <div className={styles.byline}>
                      <span className={styles.author}>{message.author_username}</span>
                      <Tag size="sm" type={fromStudent ? "cool-gray" : "purple"}>{fromStudent ? "考生" : "教師"}</Tag>
                      {user && String(message.author_id) === String(user.id) && <span className={styles.meta}>（你）</span>}
                      <time className={styles.time} dateTime={message.created_at}>{formatDate(message.created_at, { includeSeconds: true })}</time>
                    </div>
                    <p className={styles.content}>{message.content}</p>
                  </div>
                </li>;
              })}
              {closed && <li className={styles.post}>
                <div className={styles.rail}><span className={styles.railIcon}><Locked size={16} /></span></div>
                <p className={`${styles.body} ${styles.meta}`} role="status">{managing ? "此申訴已結案，可查閱對話。" : "此申訴已結案。如仍有疑問，請填寫理由重新開啟，原對話將保留。"}</p>
              </li>}
              {(!closed || reopening) && <li className={styles.post}>
                <div className={styles.rail}><Avatar name={user?.username} size="sm" /></div>
                <div className={styles.composer}>
                  <TextArea id="grade-appeal-message" labelText={reopening ? "重開理由" : managing ? "複核回覆" : "說明原答案（不得補作答）"} helperText={reopening ? "限 5000 字；請說明仍有疑問的地方。重開後將通知教師／助教，請勿補作答。" : managing ? "限 5000 字；請指出原答案的複核依據及處理結果。" : "限 5000 字；可解釋原答案，不得新增程式、推導或解法來補足作答。"} value={draft} onChange={e => setDraft(e.target.value)} invalid={tooLong} invalidText="請將訊息縮短至 5000 字內。" rows={3} disabled={saving} />
                  <div className={styles.composerActions}>
                    {managing && currentId && <Button kind="ghost" size="sm" disabled={saving} onClick={() => void close()}>結案</Button>}
                    <Button size="sm" disabled={saving || !draft.trim() || tooLong} onClick={() => void send()}>{saving ? "處理中…" : reopening ? "重新開啟申訴" : currentId ? managing ? "送出回覆" : "送出說明" : "送出申訴"}</Button>
                  </div>
                </div>
              </li>}
            </ol>
          </section>
        </>}
      </div>
    </Modal>
  );
}
