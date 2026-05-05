import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, TextArea, Tag, InlineLoading } from "@carbon/react";
import {
  ArrowRight,
  Checkmark,
  Flag,
  FlagFilled,
  Save,
  Undo,
  UserFollow,
} from "@carbon/icons-react";
import { motion } from "motion/react";
import MarkdownContent from "@/shared/ui/markdown/MarkdownContent";
import AnswerDisplay from "@/features/contest/components/exam/AnswerDisplay";
import ScoreSlider, { formatScore, getScoreColor } from "./ScoreSlider";
import type { GradingAnswerRow } from "./gradingTypes";
import { isSubjectiveType } from "./gradingTypes";
import { useTranslation } from "react-i18next";
import { EXAM_QUESTION_TYPE_ICON } from "@/shared/ui/examQuestionTypeVisual";
import { getSubmission } from "@/infrastructure/api/repositories/submission.repository";
import type { SubmissionDetail } from "@/core/entities/submission.entity";
import styles from "./GradingPanel.module.scss";

interface GradingSplitPanelScreenProps {
  answer: GradingAnswerRow | null;
  onGrade: (answerId: string, score: number, feedback: string) => void;
  onUngrade?: (answerId: string) => void;
  isFlagged?: boolean;
  onToggleFlag?: (answerId: string) => void;
  flowMode?: "byQuestion" | "byStudent";
  onNextQuestion?: () => void;
  hasNextQuestion?: boolean;
  onNextStudent?: () => void;
  hasNextStudent?: boolean;
  contextPath?: {
    primary: string;
    secondary?: string;
  };
  readOnly?: boolean;
}

export default function GradingSplitPanelScreen({
  answer,
  onGrade,
  onUngrade,
  isFlagged = false,
  onToggleFlag,
  flowMode = "byStudent",
  onNextQuestion,
  hasNextQuestion = false,
  onNextStudent,
  hasNextStudent = false,
  readOnly = false,
}: GradingSplitPanelScreenProps) {
  const { t } = useTranslation("contest");
  const [score, setScore] = useState<number>(0);
  const [feedback, setFeedback] = useState("");
  const [saved, setSaved] = useState(false);
  const scoreInputBufferRef = useRef("");
  const scoreInputBufferTimerRef = useRef<number | null>(null);
  const saveCooldownRef = useRef<number | null>(null);
  const saveLockedRef = useRef(false);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const [submissionDetail, setSubmissionDetail] = useState<SubmissionDetail | null>(null);
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const maxScore = answer?.maxScore ?? 0;
  const isSubjective = !readOnly && answer ? isSubjectiveType(answer.questionType) : false;
  const scoreStep = isSubjective ? 0.5 : 1;

  const fallbackCodeFromAnswer = useMemo(() => {
    if (!answer) return "";
    const content = answer.answerContent as Record<string, unknown>;
    const candidates = [
      content.code,
      content.sourceCode,
      content.source_code,
      content.latestCode,
      content.latest_code,
      content.text,
    ];
    const found = candidates.find((item) => typeof item === "string" && item.trim().length > 0);
    return typeof found === "string" ? found : "";
  }, [answer]);

  const resolvedCode = submissionDetail?.code || fallbackCodeFromAnswer;

  const resolvedSubmissionMeta = useMemo(() => {
    if (!answer) {
      return null;
    }
    const content = answer.answerContent as Record<string, unknown>;
    return {
      status:
        submissionDetail?.status ??
        answer.latestSubmissionStatus ??
        (typeof content.status === "string" ? content.status : null),
      language:
        submissionDetail?.language ??
        answer.latestSubmissionLanguage ??
        (typeof content.language === "string" ? content.language : null),
      score:
        submissionDetail?.score ??
        answer.score ??
        (typeof content.score === "number" ? content.score : null),
      execTime:
        submissionDetail?.execTime ??
        answer.latestSubmissionExecTime ??
        (typeof content.execTime === "number" ? content.execTime : null),
      memoryUsage:
        submissionDetail?.memoryUsage ??
        answer.latestSubmissionMemoryUsage ??
        (typeof content.memoryUsage === "number" ? content.memoryUsage : null),
      createdAt:
        submissionDetail?.createdAt ??
        answer.latestSubmissionCreatedAt ??
        (typeof content.createdAt === "string" ? content.createdAt : null),
    };
  }, [answer, submissionDetail]);

  // ── Lifecycle ──

  useEffect(() => {
    if (answer) {
      setScore(answer.score ?? 0);
      setFeedback(answer.feedback ?? "");
      setSaved(false);
      scoreInputBufferRef.current = "";
    }
    saveLockedRef.current = false;
    if (saveCooldownRef.current !== null) {
      window.clearTimeout(saveCooldownRef.current);
      saveCooldownRef.current = null;
    }
    panelBodyRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
  }, [answer?.id]);

  useEffect(() => {
    return () => {
      if (scoreInputBufferTimerRef.current !== null)
        window.clearTimeout(scoreInputBufferTimerRef.current);
      if (saveCooldownRef.current !== null)
        window.clearTimeout(saveCooldownRef.current);
    };
  }, []);

  useEffect(() => {
    if (!readOnly || !answer) {
      setSubmissionDetail(null);
      setSubmissionLoading(false);
      return;
    }
    const submissionId =
      answer.latestSubmissionId ||
      ((answer.answerContent as Record<string, unknown>).submissionId as string | undefined) ||
      ((answer.answerContent as Record<string, unknown>).submission_id as string | undefined);

    if (!submissionId) {
      setSubmissionDetail(null);
      setSubmissionLoading(false);
      return;
    }

    let canceled = false;
    setSubmissionLoading(true);
    void getSubmission(String(submissionId))
      .then((data) => {
        if (canceled) return;
        setSubmissionDetail(data);
      })
      .catch(() => {
        if (canceled) return;
        setSubmissionDetail(null);
      })
      .finally(() => {
        if (!canceled) {
          setSubmissionLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [answer, readOnly]);

  // ── Helpers ──

  const clampScore = (value: number, fallback = 0) => {
    if (!Number.isFinite(value)) return fallback;
    const rounded = Math.round(value / scoreStep) * scoreStep;
    return Math.max(0, Math.min(maxScore, rounded));
  };

  const goNext = useCallback(() => {
    if (flowMode === "byQuestion") {
      if (hasNextStudent && onNextStudent) { onNextStudent(); return; }
      if (hasNextQuestion && onNextQuestion) { onNextQuestion(); }
      return;
    }
    if (hasNextQuestion && onNextQuestion) { onNextQuestion(); return; }
    if (hasNextStudent && onNextStudent) { onNextStudent(); }
  }, [flowMode, hasNextQuestion, hasNextStudent, onNextQuestion, onNextStudent]);

  const updateScore = useCallback((value: number) => {
    setScore((prev) => clampScore(value, prev));
    setSaved(false);
  }, [maxScore, scoreStep]);

  // ── Keyboard shortcuts ──

  const resetScoreBufferTimer = () => {
    if (scoreInputBufferTimerRef.current !== null)
      window.clearTimeout(scoreInputBufferTimerRef.current);
    scoreInputBufferTimerRef.current = window.setTimeout(() => {
      scoreInputBufferRef.current = "";
      scoreInputBufferTimerRef.current = null;
    }, 1200);
  };

  useEffect(() => {
    if (!answer || !isSubjective) return;
    const handleScoreKeyboardShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" || target.isContentEditable)
      ) return;

      const key = event.key;
      if (key === "ArrowUp" || key === "ArrowRight" || key === "+" || key === "=") {
        event.preventDefault(); updateScore(score + scoreStep); return;
      }
      if (key === "ArrowDown" || key === "ArrowLeft" || key === "-" || key === "_") {
        event.preventDefault(); updateScore(score - scoreStep); return;
      }
      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        const nextBuffer = `${scoreInputBufferRef.current}${key}`.replace(/^0+(?=\d)/, "");
        const parsed = Number(nextBuffer);
        if (!Number.isNaN(parsed) && parsed <= maxScore) {
          scoreInputBufferRef.current = nextBuffer;
          updateScore(parsed);
        } else {
          const singleDigit = Number(key);
          if (singleDigit <= maxScore) {
            scoreInputBufferRef.current = key;
            updateScore(singleDigit);
          } else {
            scoreInputBufferRef.current = "";
          }
        }
        resetScoreBufferTimer();
      }
    };
    window.addEventListener("keydown", handleScoreKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleScoreKeyboardShortcut);
  }, [answer, isSubjective, maxScore, score, scoreStep]);

  // ── Save / Next ──

  const doSave = useCallback((): boolean => {
    if (!answer || !isSubjective) return false;
    if (saveLockedRef.current) return false;
    saveLockedRef.current = true;
    if (saveCooldownRef.current !== null) window.clearTimeout(saveCooldownRef.current);
    saveCooldownRef.current = window.setTimeout(() => {
      saveLockedRef.current = false;
      saveCooldownRef.current = null;
    }, 350);
    onGrade(answer.id, score, feedback);
    return true;
  }, [answer, feedback, isSubjective, onGrade, score]);

  const handleSaveAndNext = useCallback(() => {
    if (!doSave()) return;
    if (hasNextQuestion || hasNextStudent) { goNext(); return; }
    setSaved(true);
  }, [doSave, goNext, hasNextQuestion, hasNextStudent]);

  const handleSaveOnly = useCallback(() => {
    if (!doSave()) return;
    setSaved(true);
  }, [doSave]);

  useEffect(() => {
    if (!answer) return;
    const handleEnterShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" || target.isContentEditable)
      ) return;
      event.preventDefault();
      if (isSubjective) { handleSaveAndNext(); } else { goNext(); }
    };
    window.addEventListener("keydown", handleEnterShortcut);
    return () => window.removeEventListener("keydown", handleEnterShortcut);
  }, [answer, isSubjective, flowMode, hasNextQuestion, hasNextStudent, onNextQuestion, onNextStudent, handleSaveAndNext]);

  // ── Render ──

  if (!answer) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelEmpty}>
          {t("grading.selectAnswerToGrade", "選擇一位學生的作答來開始批改")}
        </div>
      </div>
    );
  }

  const scoreRatio = maxScore > 0 ? score / maxScore : 0;
  const scoreColor = getScoreColor(scoreRatio);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeading}>
          {(() => {
            const TypeIcon = EXAM_QUESTION_TYPE_ICON[answer.questionType];
            return <TypeIcon size={14} className={styles.panelHeaderIcon} />;
          })()}
          <span className={styles.panelHeaderLabel}>Q{answer.questionIndex}</span>
          <Tag type="blue" size="sm">{t(`common:questionType.label.${answer.questionType}`, answer.questionType)}</Tag>
          <Tag type="teal" size="sm">{answer.maxScore}</Tag>
        </div>
        <div className={styles.panelHeaderActions}>
          {onToggleFlag && (
            <button
              className={`${styles.flagToggle} ${isFlagged ? styles.flagToggleActive : ""}`}
              onClick={() => onToggleFlag(answer.id)}
              aria-label={t("grading.toggleFlag", "標記")}
            >
              {isFlagged ? <FlagFilled size={16} /> : <Flag size={16} />}
            </button>
          )}
          {answer.gradedBy && (
            <span className={styles.panelHeaderMeta}>
              {answer.gradedBy === "system"
                ? t("grading.auto", "自動批改")
                : t("grading.gradedByLabel", "批改者：{{name}}", { name: answer.gradedBy })}
            </span>
          )}
        </div>
      </div>

      <div ref={panelBodyRef} className={styles.panelBody}>
        <motion.div
          layout
          className={styles.panelBodyContent}
          transition={{ layout: { duration: 0.18, ease: "easeOut" } }}
        >
          <span className={styles.studentLine}>
            {answer.studentDisplayName === answer.studentUsername
              ? answer.studentDisplayName
              : `${answer.studentDisplayName} (${answer.studentUsername})`}
          </span>

          <div className={styles.questionPrompt}>
            <MarkdownContent.Problem>{answer.questionPrompt}</MarkdownContent.Problem>
          </div>

          <AnswerDisplay
            questionType={answer.questionType}
            answerContent={answer.answerContent}
            options={answer.questionOptions}
            correctAnswer={answer.correctAnswer}
            explanation={answer.questionExplanation}
          />

          {readOnly ? (
            <div className={styles.questionPrompt}>
              <div className={styles.studentLine}>{t("grading.latestSubmissionCode", "最後一次 Submission 程式碼")}</div>
              {submissionLoading ? (
                <InlineLoading description={t("grading.loadingSubmission", "載入 submission...")} />
              ) : resolvedCode ? (
                <pre style={{ whiteSpace: "pre-wrap", marginTop: "0.5rem" }}>
                  <code>{resolvedCode}</code>
                </pre>
              ) : (
                <span>{t("grading.noSubmissionCode", "找不到程式碼內容")}</span>
              )}
              {resolvedSubmissionMeta ? (
                <div className={styles.shortcutHint} style={{ marginTop: "0.75rem" }}>
                  {resolvedSubmissionMeta.status ? (
                    <Tag type="blue" size="sm">{String(resolvedSubmissionMeta.status)}</Tag>
                  ) : null}
                  {resolvedSubmissionMeta.language ? (
                    <Tag type="cool-gray" size="sm">{resolvedSubmissionMeta.language}</Tag>
                  ) : null}
                  {typeof resolvedSubmissionMeta.score === "number" ? (
                    <Tag type="teal" size="sm">{resolvedSubmissionMeta.score}/{maxScore}</Tag>
                  ) : null}
                  {typeof resolvedSubmissionMeta.execTime === "number" ? (
                    <Tag type="warm-gray" size="sm">{resolvedSubmissionMeta.execTime} ms</Tag>
                  ) : null}
                  {typeof resolvedSubmissionMeta.memoryUsage === "number" ? (
                    <Tag type="warm-gray" size="sm">{resolvedSubmissionMeta.memoryUsage} KB</Tag>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <hr className={styles.divider} />

          {!readOnly ? (
            <>
              {/* Score display */}
              <div className={styles.scoreDisplay}>
                <span className={styles.scoreLabel}>
                  {isSubjective
                    ? t("grading.scoreLabel", "批改成績")
                    : t("grading.autoScoreLabel", "自動批改成績")}
                </span>
                <span className={styles.scoreValue} style={{ color: scoreColor.bg }}>
                  {formatScore(score)}
                </span>
                <span className={styles.scoreMax}>/ {formatScore(maxScore)}</span>
              </div>

              <div data-testid="grading-score-slider-wrap">
                <ScoreSlider
                  value={score}
                  max={maxScore}
                  step={scoreStep}
                  disabled={!isSubjective}
                  onChange={updateScore}
                />
              </div>
            </>
          ) : null}

          {!readOnly && isSubjective ? (
            <div className={styles.shortcutHint}>
              <span className={styles.shortcutGroup}>
                <kbd className={styles.keyCap}>↑</kbd>
                <kbd className={styles.keyCap}>↓</kbd>
                <span>{t("grading.shortcutAdjust", "調整分數")}</span>
              </span>
              <span className={styles.shortcutGroup}>
                <kbd className={styles.keyCap}>0-9</kbd>
                <span>{t("grading.shortcutDirectInput", "直接輸入")}</span>
              </span>
              <span className={styles.shortcutGroup}>
                <kbd className={styles.keyCap}>Enter</kbd>
                <span>{t("grading.shortcutCommitAndNext", "儲存/前往下一步")}</span>
              </span>
            </div>
          ) : (
            <p className={styles.readonlyHint}>
              {t(
                "grading.objectiveReadonlyHint",
                "客觀題為自動批改，若分數異常請使用上方「自動批改客觀題」。",
              )}
            </p>
          )}

          {!readOnly ? (
            <TextArea
              id="panel-feedback"
              labelText={t("grading.feedback", "評語（選填）")}
              value={feedback}
              disabled={!isSubjective}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                setFeedback(e.target.value);
                setSaved(false);
              }}
              rows={3}
            />
          ) : null}
        </motion.div>

      </div>

      {!readOnly ? (
        <div className={styles.panelActions}>
        <div className={styles.panelActionsSecondary}>
          {answer.gradedBy && onUngrade && (
            <Button
              kind="danger--ghost"
              size="lg"
              renderIcon={Undo}
              onClick={() => onUngrade(answer.id)}
            >
              {t("grading.ungrade", "撤回批改")}
            </Button>
          )}
          {flowMode === "byStudent" && hasNextQuestion && (
            <Button
              kind="secondary"
              size="lg"
              renderIcon={ArrowRight}
              onClick={onNextQuestion}
            >
              {t("grading.nextQuestion", "下一題")}
            </Button>
          )}
          {flowMode === "byStudent" && !hasNextQuestion && hasNextStudent && (
            <Button
              kind="secondary"
              size="lg"
              renderIcon={UserFollow}
              onClick={onNextStudent}
            >
              {t("grading.nextStudent", "下一位學生")}
            </Button>
          )}
        </div>
        {isSubjective ? (
          <div className={styles.panelActionsPrimary}>
            <Button
              kind="ghost"
              size="lg"
              renderIcon={Save}
              data-testid="grading-save-score-btn"
              onClick={handleSaveOnly}
            >
              {saved
                ? t("grading.saved", "已儲存")
                : t("grading.save", "儲存")}
            </Button>
            {(hasNextStudent || (flowMode === "byStudent" && hasNextQuestion)) && (
              <Button
                kind="primary"
                size="lg"
                renderIcon={Checkmark}
                onClick={handleSaveAndNext}
              >
                {flowMode === "byQuestion"
                  ? t("grading.saveAndNextStudent", "儲存並下一位學生")
                  : hasNextQuestion
                    ? t("grading.saveAndNextQuestion", "儲存並下一題")
                    : t("grading.saveAndNextStudent", "儲存並下一位學生")}
              </Button>
            )}
          </div>
        ) : null}
        </div>
      ) : null}
    </div>
  );
}
