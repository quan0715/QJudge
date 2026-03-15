import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, TextArea, Tag } from "@carbon/react";
import {
  ArrowRight,
  Boolean as BooleanIcon,
  Checkbox as CheckboxIcon,
  Checkmark,
  Document,
  Pen,
  RadioButton as RadioButtonIcon,
  UserFollow,
} from "@carbon/icons-react";
import MarkdownContent from "@/shared/ui/markdown/MarkdownContent";
import AnswerDisplay from "@/features/contest/components/exam/AnswerDisplay";
import type { GradingAnswerRow } from "./gradingTypes";
import { isSubjectiveType } from "./gradingTypes";
import { useTranslation } from "react-i18next";
import type { ExamQuestionType } from "@/core/entities/contest.entity";
import styles from "./GradingPanel.module.scss";

const QUESTION_TYPE_ICON: Record<ExamQuestionType, React.ElementType> = {
  single_choice: RadioButtonIcon,
  multiple_choice: CheckboxIcon,
  true_false: BooleanIcon,
  short_answer: Pen,
  essay: Document,
};

interface GradingSplitPanelScreenProps {
  answer: GradingAnswerRow | null;
  onGrade: (answerId: string, score: number, feedback: string) => void;
  flowMode?: "byQuestion" | "byStudent";
  onNextQuestion?: () => void;
  hasNextQuestion?: boolean;
  onNextStudent?: () => void;
  hasNextStudent?: boolean;
  contextPath?: {
    primary: string;
    secondary?: string;
  };
}

export default function GradingSplitPanelScreen({
  answer,
  onGrade,
  flowMode = "byStudent",
  onNextQuestion,
  hasNextQuestion = false,
  onNextStudent,
  hasNextStudent = false,
}: GradingSplitPanelScreenProps) {
  const { t } = useTranslation("contest");
  const [score, setScore] = useState<number>(0);
  const [feedback, setFeedback] = useState("");
  const [saved, setSaved] = useState(false);
  const scoreInputBufferRef = useRef("");
  const scoreInputBufferTimerRef = useRef<number | null>(null);
  const saveCooldownRef = useRef<number | null>(null);
  const saveLockedRef = useRef(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const maxScore = answer?.maxScore ?? 0;
  const isSubjective = answer ? isSubjectiveType(answer.questionType) : false;
  const scoreStep = isSubjective ? 0.5 : 1;

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
  }, [answer?.id]);

  useEffect(() => {
    return () => {
      if (scoreInputBufferTimerRef.current !== null)
        window.clearTimeout(scoreInputBufferTimerRef.current);
      if (saveCooldownRef.current !== null)
        window.clearTimeout(saveCooldownRef.current);
    };
  }, []);

  // ── Helpers ──

  const clampScore = (value: number, fallback = 0) => {
    if (!Number.isFinite(value)) return fallback;
    const rounded = Math.round(value / scoreStep) * scoreStep;
    return Math.max(0, Math.min(maxScore, rounded));
  };

  const formatScore = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

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

  // ── Slider pointer handling ──

  const getValueFromPosition = useCallback((clientX: number) => {
    const pill = pillRef.current;
    if (!pill || maxScore <= 0) return 0;
    const rect = pill.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = ratio * maxScore;
    const rounded = Math.round(raw / scoreStep) * scoreStep;
    return Math.max(0, Math.min(maxScore, rounded));
  }, [maxScore, scoreStep]);

  const handleSliderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSubjective) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    updateScore(getValueFromPosition(e.clientX));
  }, [isSubjective, getValueFromPosition, updateScore]);

  const handleSliderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    updateScore(getValueFromPosition(e.clientX));
  }, [getValueFromPosition, updateScore]);

  const handleSliderPointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // ── Tick marks ──

  /** Tick marks — labels (integers) + inner lines (every scoreStep). */
  const tickLabels = useMemo(() => {
    if (maxScore <= 0) return [0];
    const step = maxScore <= 10 ? 1 : maxScore <= 20 ? 2 : 5;
    const result: number[] = [];
    for (let i = 0; i <= maxScore; i += step) result.push(i);
    if (result[result.length - 1] !== maxScore) result.push(maxScore);
    return result;
  }, [maxScore]);

  const tickLines = useMemo(() => {
    if (maxScore <= 0) return [];
    const result: number[] = [];
    for (let i = scoreStep; i < maxScore; i += scoreStep) {
      result.push(i);
    }
    return result;
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

  const handleSave = useCallback(() => {
    if (!answer || !isSubjective) return;
    if (saveLockedRef.current) return;
    saveLockedRef.current = true;
    if (saveCooldownRef.current !== null) window.clearTimeout(saveCooldownRef.current);
    saveCooldownRef.current = window.setTimeout(() => {
      saveLockedRef.current = false;
      saveCooldownRef.current = null;
    }, 350);
    onGrade(answer.id, score, feedback);
    if (hasNextQuestion || hasNextStudent) { goNext(); return; }
    setSaved(true);
  }, [answer, feedback, goNext, isSubjective, onGrade, score]);

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
      if (isSubjective) { handleSave(); } else { goNext(); }
    };
    window.addEventListener("keydown", handleEnterShortcut);
    return () => window.removeEventListener("keydown", handleEnterShortcut);
  }, [answer, isSubjective, flowMode, hasNextQuestion, hasNextStudent, onNextQuestion, onNextStudent, handleSave]);

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

  const scorePct = maxScore > 0 ? (score / maxScore) * 100 : 0;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeading}>
          {(() => {
            const TypeIcon = QUESTION_TYPE_ICON[answer.questionType];
            return <TypeIcon size={14} className={styles.panelHeaderIcon} />;
          })()}
          <span className={styles.panelHeaderLabel}>Q{answer.questionIndex}</span>
          <Tag type="blue" size="sm">{t(`common:questionType.label.${answer.questionType}`, answer.questionType)}</Tag>
          <Tag type="teal" size="sm">{answer.maxScore}</Tag>
        </div>
        {answer.gradedBy && (
          <span className={styles.panelHeaderMeta}>
            {answer.gradedBy === "system"
              ? t("grading.auto", "自動批改")
              : answer.gradedBy}
          </span>
        )}
      </div>

      <div className={styles.panelBody}>
        <span className={styles.studentLine}>
          {answer.studentNickname} ({answer.studentUsername})
        </span>

        <div className={styles.questionPrompt}>
          <MarkdownContent.Problem>{answer.questionPrompt}</MarkdownContent.Problem>
        </div>

        <AnswerDisplay
          questionType={answer.questionType}
          answerContent={answer.answerContent}
          options={answer.questionOptions}
          correctAnswer={answer.correctAnswer}
        />

        <hr className={styles.divider} />

        {isSubjective ? (
          <>
            <div className={styles.sliderRow}>
              <div className={styles.sliderArea}>
                <div
                  className={styles.sliderPill}
                  ref={pillRef}
                  onPointerDown={handleSliderPointerDown}
                  onPointerMove={handleSliderPointerMove}
                  onPointerUp={handleSliderPointerUp}
                >
                  {tickLines.map((v) => (
                    <span
                      key={v}
                      className={Number.isInteger(v) ? styles.tickLineMajor : styles.tickLine}
                      style={{ left: `${(v / maxScore) * 100}%` }}
                    />
                  ))}
                  <div
                    className={styles.sliderFill}
                    style={{ width: `max(1.5rem, ${scorePct}%)` }}
                  >
                    <span className={styles.sliderValue}>{formatScore(score)}</span>
                  </div>
                </div>
                <div className={styles.sliderTicks}>
                  {tickLabels.map((v) => (
                    <span
                      key={v}
                      className={styles.tick}
                      style={{ left: `${maxScore > 0 ? (v / maxScore) * 100 : 0}%` }}
                    >
                      {formatScore(v)}
                    </span>
                  ))}
                </div>
              </div>
              <span className={styles.sliderMaxOuter}>/ {formatScore(maxScore)}</span>
            </div>

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
          </>
        ) : (
          <>
            <div className={styles.scoreReadonly}>
              <span className={styles.scoreValue}>{formatScore(score)}</span>
              <span className={styles.scoreMax}>/ {formatScore(maxScore)}</span>
            </div>
            <p className={styles.readonlyHint}>
              {t(
                "grading.objectiveReadonlyHint",
                "客觀題為自動批改，若分數異常請使用上方「自動批改客觀題」。",
              )}
            </p>
          </>
        )}

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

        <div className={styles.panelActions}>
          {hasNextQuestion && (
            <Button
              kind="secondary"
              size="sm"
              renderIcon={ArrowRight}
              onClick={onNextQuestion}
            >
              {t("grading.nextQuestion", "下一題")}
            </Button>
          )}
          {flowMode === "byStudent" && !hasNextQuestion && hasNextStudent && (
            <Button
              kind="secondary"
              size="sm"
              renderIcon={UserFollow}
              onClick={onNextStudent}
            >
              {t("grading.nextStudent", "下一位學生")}
            </Button>
          )}
          {isSubjective ? (
            <Button
              kind="primary"
              size="sm"
              renderIcon={Checkmark}
              onClick={handleSave}
            >
              {saved
                ? t("grading.saved", "已儲存")
                : flowMode === "byQuestion" && hasNextStudent
                  ? t("grading.saveAndNextStudent", "儲存並下一位學生")
                  : t("grading.save", "儲存")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
