import React, { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Tag,
  Loading,
  Tooltip,
} from "@carbon/react";
import {
  ArrowLeft,
  ArrowRight,
  Time,
  CenterToFit,
  ListBulleted,
  List,
  SendFilled,
  Recording,
} from "@carbon/icons-react";
import { usePaperExamFlow } from "./usePaperExamFlow";
import { useInterval } from "@/shared/hooks/useInterval";
import { ExamQuestionCard } from "../../components/exam/ExamQuestionCard";
import { ExamNavigator } from "../../components/exam/ExamNavigator";
import {
  useCountdownTo,
  useScrollDirection,
  usePaperExamQuestions,
  usePaperExamAutoSave,
  usePaperExamAntiCheat,
} from "./hooks";
import type { ExamViewMode } from "../../types/exam.types";
import styles from "./PaperExamAnswering.module.scss";

const VIEW_MODES: { key: ExamViewMode; label: string; icon: typeof CenterToFit }[] = [
  { key: "single", label: "逐題模式", icon: CenterToFit },
  { key: "all", label: "全題模式", icon: ListBulleted },
];

const SAVE_STATUS_LABEL: Record<string, string> = {
  idle: "",
  saving: "儲存中…",
  saved: "已儲存",
  error: "儲存失敗",
};

const PaperExamAnsweringScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contestId, contest, heartbeat, submitExam } = usePaperExamFlow();

  const { items, answers, setAnswers, answeredIds, loadingQuestions } =
    usePaperExamQuestions(contestId);

  const isInProgress = contest?.examStatus === "in_progress";
  const countdown = useCountdownTo(contest?.endTime);

  const { handleAnswerChange, saveStatus } = usePaperExamAutoSave({ contestId, setAnswers });
  usePaperExamAntiCheat({ contestId, isInProgress });

  // Heartbeat every 30s
  useInterval(() => {
    heartbeat().catch(() => {});
  }, isInProgress ? 30000 : null);

  // UI state
  const [viewMode, setViewMode] = useState<ExamViewMode>("single");
  const [activeIndex, setActiveIndex] = useState(0);
  const [navVisible, setNavVisible] = useState(true);
  const [slideDir, setSlideDir] = useState<"left" | "right">("right");
  const [animating, setAnimating] = useState(false);

  const questionAreaRef = useRef<HTMLDivElement>(null);
  const allContentRef = useRef<HTMLDivElement>(null);
  const allItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Auto-submit when time expires
  useEffect(() => {
    if (countdown.remaining !== null && countdown.remaining === 0 && isInProgress && contestId) {
      submitExam().finally(() => {
        navigate(`/contests/${contestId}/paper-exam/submit-review`);
      });
    }
  }, [countdown.remaining, isInProgress, contestId, navigate, submitExam]);

  // Guard route: exam-mode users must pass through precheck before answering.
  useEffect(() => {
    if (!contestId || !contest?.examModeEnabled) return;

    if (contest.examStatus === "not_started") {
      navigate(`/contests/${contestId}/paper-exam/precheck`, { replace: true });
      return;
    }

    if (contest.examStatus === "submitted") {
      navigate(`/contests/${contestId}/paper-exam/submit-review`, { replace: true });
    }
  }, [contest?.examModeEnabled, contest?.examStatus, contestId, navigate]);

  // Slide animation
  const handleSetActiveIndex = useCallback((newIndex: number | ((prev: number) => number)) => {
    setActiveIndex((prev) => {
      const next = typeof newIndex === "function" ? newIndex(prev) : newIndex;
      if (next !== prev) {
        setSlideDir(next > prev ? "right" : "left");
        setAnimating(true);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (animating) {
      const t = setTimeout(() => setAnimating(false), 300);
      return () => clearTimeout(t);
    }
  }, [animating, activeIndex]);

  useEffect(() => {
    questionAreaRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeIndex]);

  // All-mode scroll tracking
  const [allModeActiveIndex, setAllModeActiveIndex] = useState(0);
  useEffect(() => {
    if (viewMode !== "all") return;
    const container = allContentRef.current;
    if (!container) return;
    const onScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const centerY = containerRect.top + containerRect.height / 2;
      let closestIdx = 0;
      let closestDist = Infinity;
      allItemRefs.current.forEach((el, idx) => {
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - centerY);
        if (dist < closestDist) { closestDist = dist; closestIdx = idx; }
      });
      setAllModeActiveIndex(closestIdx);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // Toolbar auto-hide
  const singleScrollVisible = useScrollDirection(questionAreaRef);
  const allScrollVisible = useScrollDirection(allContentRef);
  const toolbarVisible = viewMode === "single" ? singleScrollVisible : allScrollVisible;

  const handleScrollToItem = useCallback((index: number) => {
    const el = allItemRefs.current.get(index);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  if (loadingQuestions) {
    return (
      <div className={styles.centered}>
        <Loading withOverlay={false} small />
        <span>載入考試題目中...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.centered}>
        <span>此考試尚未設定任何題目</span>
      </div>
    );
  }

  const renderSingleMode = () => {
    const item = items[activeIndex];
    if (!item || item.kind !== "question") return null;
    const isLast = activeIndex === items.length - 1;
    const slideClass = animating
      ? slideDir === "right" ? styles.slideInRight : styles.slideInLeft
      : "";

    return (
      <div className={styles.singleContent}>
        <div className={styles.questionArea} ref={questionAreaRef}>
          <div className={`${styles.questionInner} ${slideClass}`} key={activeIndex}>
            <ExamQuestionCard
              question={item.data}
              index={activeIndex}
              answer={answers[item.data.id]}
              onAnswerChange={handleAnswerChange}
            />
          </div>
        </div>
        <div className={styles.navButtons}>
          <Button
            kind="ghost" size="sm" renderIcon={ArrowLeft}
            disabled={activeIndex === 0}
            onClick={() => handleSetActiveIndex((i) => i - 1)}
          >上一題</Button>
          <span className={styles.navInfo}>{activeIndex + 1} / {items.length}</span>
          <Button
            kind="ghost" size="sm" renderIcon={ArrowRight}
            disabled={isLast}
            onClick={() => handleSetActiveIndex((i) => i + 1)}
          >下一題</Button>
        </div>
      </div>
    );
  };

  const renderAllMode = () => (
    <div className={styles.allContent} ref={allContentRef}>
      <div className={styles.allSpacer} />
      {items.map((item, index) => {
        if (item.kind !== "question") return null;
        const dimClass = index !== allModeActiveIndex ? styles.allItemDimmed : "";
        return (
          <div
            key={item.data.id}
            data-index={index}
            ref={(el) => {
              if (el) allItemRefs.current.set(index, el);
              else allItemRefs.current.delete(index);
            }}
            className={`${styles.allItem} ${dimClass}`}
          >
            <ExamQuestionCard
              question={item.data}
              index={index}
              answer={answers[item.data.id]}
              onAnswerChange={handleAnswerChange}
            />
          </div>
        );
      })}
      <div className={styles.allSpacer} />
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={`${styles.toolbar} ${toolbarVisible ? "" : styles.toolbarHidden}`}>
        <div className={styles.toolbarLeft}>
          <span className={styles.title}>{contest?.name ?? "考試"}</span>
          {contest?.examModeEnabled && (
            <Tooltip label="系統正在監測焦點、全螢幕與分頁切換行為" align="bottom" autoAlign>
              <Tag size="sm" type="red" renderIcon={Recording}>
                監測中
              </Tag>
            </Tooltip>
          )}
          {!isInProgress && (
            <Tag size="sm" type="red">考試未開始</Tag>
          )}
        </div>
        <div className={styles.toolbarCenter}>
          {saveStatus !== "idle" && (
            <span className={`${styles.saveStatus} ${saveStatus === "error" ? styles.saveStatusError : ""}`}>
              {SAVE_STATUS_LABEL[saveStatus]}
            </span>
          )}
          <div className={styles.timer}>
            <Time size={16} />
            <span className={styles.timerText}>{countdown.display}</span>
          </div>
          <Button
            kind="primary" size="sm" renderIcon={SendFilled}
            onClick={() => contestId && navigate(`/contests/${contestId}/paper-exam/submit-review`)}
          >交卷</Button>
        </div>
      </div>

      {/* Mode switcher */}
      <div className={styles.modeSwitcher}>
        {VIEW_MODES.map((m) => (
          <Tooltip key={m.key} label={m.label} align="left" autoAlign>
            <button
              className={`${styles.modeBtn} ${viewMode === m.key ? styles.modeBtnActive : ""}`}
              onClick={() => setViewMode(m.key)}
              aria-label={m.label}
            >
              <m.icon size={16} />
            </button>
          </Tooltip>
        ))}
      </div>

      <div className={styles.body}>
        <div className={`${styles.navWrapper} ${navVisible ? "" : styles.navWrapperHidden}`}>
          {navVisible && (
            <ExamNavigator
              items={items}
              activeIndex={viewMode === "single" ? activeIndex : allModeActiveIndex}
              answeredIds={answeredIds}
              onSelect={viewMode === "single" ? handleSetActiveIndex : handleScrollToItem}
            />
          )}
          <button
            className={styles.navToggle}
            onClick={() => setNavVisible((v) => !v)}
            aria-label={navVisible ? "隱藏題目列表" : "顯示題目列表"}
          >
            <List size={20} />
          </button>
        </div>
        {viewMode === "single" ? renderSingleMode() : renderAllMode()}
      </div>
    </div>
  );
};

export default PaperExamAnsweringScreen;
