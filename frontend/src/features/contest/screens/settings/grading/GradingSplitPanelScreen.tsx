import { useEffect, useRef, useState } from "react";
import { Button, NumberInput, Slider, TextArea, Tag } from "@carbon/react";
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
  const maxScore = answer?.maxScore ?? 0;
  const isSubjective = answer ? isSubjectiveType(answer.questionType) : false;
  const scoreStep = isSubjective ? 0.5 : 1;

  useEffect(() => {
    if (answer) {
      setScore(answer.score ?? 0);
      setFeedback(answer.feedback ?? "");
      setSaved(false);
      scoreInputBufferRef.current = "";
    }
  }, [answer?.id]);

  useEffect(() => {
    return () => {
      if (scoreInputBufferTimerRef.current !== null) {
        window.clearTimeout(scoreInputBufferTimerRef.current);
      }
    };
  }, []);

  const clampScore = (value: number) => {
    const rounded = Math.round(value / scoreStep) * scoreStep;
    return Math.max(0, Math.min(maxScore, rounded));
  };

  const formatScore = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

  const goNext = () => {
    if (flowMode === "byQuestion") {
      if (hasNextStudent && onNextStudent) {
        setTimeout(() => onNextStudent(), 300);
        return;
      }
      if (hasNextQuestion && onNextQuestion) {
        setTimeout(() => onNextQuestion(), 300);
      }
      return;
    }

    if (hasNextQuestion && onNextQuestion) {
      setTimeout(() => onNextQuestion(), 300);
      return;
    }
    if (hasNextStudent && onNextStudent) {
      setTimeout(() => onNextStudent(), 300);
    }
  };

  const updateScore = (value: number) => {
    setScore(clampScore(value));
    setSaved(false);
  };

  const resetScoreBufferTimer = () => {
    if (scoreInputBufferTimerRef.current !== null) {
      window.clearTimeout(scoreInputBufferTimerRef.current);
    }
    scoreInputBufferTimerRef.current = window.setTimeout(() => {
      scoreInputBufferRef.current = "";
      scoreInputBufferTimerRef.current = null;
    }, 1200);
  };

  useEffect(() => {
    if (!answer || !isSubjective) {
      return;
    }

    const handleScoreKeyboardShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key;
      const lowerKey = key.toLowerCase();

      if (key === "ArrowUp" || key === "ArrowRight" || key === "+" || key === "=") {
        event.preventDefault();
        updateScore(score + scoreStep);
        return;
      }

      if (key === "ArrowDown" || key === "ArrowLeft" || key === "-" || key === "_") {
        event.preventDefault();
        updateScore(score - scoreStep);
        return;
      }

      if (key === "Home") {
        event.preventDefault();
        updateScore(0);
        return;
      }

      if (key === "End" || lowerKey === "m") {
        event.preventDefault();
        updateScore(maxScore);
        return;
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
    return () => {
      window.removeEventListener("keydown", handleScoreKeyboardShortcut);
    };
  }, [answer, isSubjective, maxScore, score, scoreStep]);

  const handleSave = () => {
    if (!answer || !isSubjective) {
      return;
    }
    onGrade(answer.id, score, feedback);
    setSaved(true);
    goNext();
  };

  useEffect(() => {
    if (!answer) {
      return;
    }

    const handleEnterShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key !== "Enter") {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      if (isSubjective) {
        handleSave();
      } else {
        goNext();
      }
    };

    window.addEventListener("keydown", handleEnterShortcut);
    return () => {
      window.removeEventListener("keydown", handleEnterShortcut);
    };
  }, [
    answer,
    isSubjective,
    flowMode,
    hasNextQuestion,
    hasNextStudent,
    onNextQuestion,
    onNextStudent,
    handleSave,
  ]);

  if (!answer) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelEmpty}>
          {t("grading.selectAnswerToGrade", "選擇一位學生的作答來開始批改")}
        </div>
      </div>
    );
  }

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

      <div className={styles.panelContent}>
        <div className={styles.panelSection}>
          <span className={styles.panelLabel}>{t("grading.student", "學生")}</span>
          <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
            {answer.studentNickname} ({answer.studentUsername})
          </span>
        </div>

        <div className={styles.panelSection}>
          <span className={styles.panelLabel}>{t("grading.question", "題目")}</span>
          <div className={styles.panelPrompt}>
            <MarkdownContent.Problem>{answer.questionPrompt}</MarkdownContent.Problem>
          </div>
        </div>

        <AnswerDisplay
          questionType={answer.questionType}
          answerContent={answer.answerContent}
          options={answer.questionOptions}
          correctAnswer={answer.correctAnswer}
        />

        <div className={styles.panelSection}>
          <div className={styles.scoreRow}>
            <NumberInput
              id="panel-score"
              label={t("grading.score", "分數")}
              value={score}
              min={0}
              max={maxScore}
              step={scoreStep}
              size="sm"
              disabled={!isSubjective}
              onChange={(_: unknown, { value }: { value: string | number }) =>
                updateScore(Number(value))
              }
              style={{ maxWidth: "140px" }}
            />
            <span className={styles.scoreMax}>/ {formatScore(maxScore)}</span>
          </div>
          {isSubjective ? (
            <div className={styles.scoreSliderWrap}>
              <Slider
                id={`subjective-score-${answer.id}`}
                labelText={t("grading.score", "分數")}
                hideLabel
                min={0}
                max={maxScore}
                step={scoreStep}
                value={score}
                hideTextInput
                onChange={({ value }) => updateScore(value ?? 0)}
              />
            </div>
          ) : null}
          {!isSubjective ? (
            <p className={styles.shortcutHint}>
              {t(
                "grading.objectiveReadonlyHint",
                "客觀題為自動批改，若分數異常請使用上方「自動批改客觀題」。",
              )}
            </p>
          ) : (
            <div className={styles.shortcutHint}>
              <span>{t("grading.shortcutPrefix", "快捷鍵")}</span>
              <span className={styles.shortcutGroup}>
                <kbd className={styles.keyCap}>↑</kbd>
                <kbd className={styles.keyCap}>↓</kbd>
                <kbd className={styles.keyCap}>+</kbd>
                <kbd className={styles.keyCap}>-</kbd>
                <span>{t("grading.shortcutAdjust", "調整分數")}</span>
              </span>
              <span className={styles.shortcutGroup}>
                <kbd className={styles.keyCap}>0-9</kbd>
                <span>{t("grading.shortcutDirectInput", "直接輸入")}</span>
              </span>
              <span className={styles.shortcutGroup}>
                <kbd className={styles.keyCap}>Home</kbd>
                <span>{t("grading.shortcutSetZero", "歸零")}</span>
              </span>
              <span className={styles.shortcutGroup}>
                <kbd className={styles.keyCap}>End</kbd>
                <kbd className={styles.keyCap}>M</kbd>
                <span>{t("grading.shortcutSetMax", "滿分")}</span>
              </span>
              <span className={styles.shortcutGroup}>
                <kbd className={styles.keyCap}>Enter</kbd>
                <span>{t("grading.shortcutCommitAndNext", "儲存/前往下一步")}</span>
              </span>
            </div>
          )}
        </div>

        <div className={styles.panelSection}>
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
        </div>

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
