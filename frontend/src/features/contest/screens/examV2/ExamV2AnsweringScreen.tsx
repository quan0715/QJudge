import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
} from "@carbon/icons-react";
import { useExamV2Flow } from "./useExamV2Flow";
import { useInterval } from "@/shared/hooks/useInterval";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import {
  submitExamAnswer,
  getMyExamAnswers,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import { ExamQuestionCard } from "../../components/exam/ExamQuestionCard";
import { ExamNavigator } from "../../components/exam/ExamNavigator";
import type { ExamItem, ExamViewMode } from "../../types/examDemo.types";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import styles from "../examDemo/StudentExamDemoScreen.module.scss";

const VIEW_MODES: { key: ExamViewMode; label: string; icon: typeof CenterToFit }[] = [
  { key: "single", label: "逐題模式", icon: CenterToFit },
  { key: "all", label: "全題模式", icon: ListBulleted },
];

// Debounce delay for auto-save (ms)
const AUTO_SAVE_DELAY = 2000;

function useCountdownTo(endTime: string | null | undefined) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endTime) return;
    const calc = () => {
      const diff = Math.max(0, Math.floor((new Date(endTime).getTime() - Date.now()) / 1000));
      setRemaining(diff);
      return diff;
    };
    calc();
    const id = setInterval(() => {
      if (calc() <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  const hh = String(Math.floor(remaining / 3600)).padStart(2, "0");
  const mm = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  return { remaining, display: remaining >= 3600 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}` };
}

function useScrollDirection(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const y = el.scrollTop;
      if (y < 10) setVisible(true);
      else if (y < lastY.current) setVisible(true);
      else if (y > lastY.current + 5) setVisible(false);
      lastY.current = y;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);
  return visible;
}

const ExamV2AnsweringScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contestId, contest, heartbeat } = useExamV2Flow();

  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [viewMode, setViewMode] = useState<ExamViewMode>("single");
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [navVisible, setNavVisible] = useState(true);
  const [slideDir, setSlideDir] = useState<"left" | "right">("right");
  const [animating, setAnimating] = useState(false);
  const prevIndexRef = useRef(activeIndex);

  // Refs for scroll
  const questionAreaRef = useRef<HTMLDivElement>(null);
  const allContentRef = useRef<HTMLDivElement>(null);
  const allItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Pending saves (debounce)
  const pendingSaves = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const isInProgress = contest?.examStatus === "in_progress";
  const countdown = useCountdownTo(contest?.endTime);

  // Build items from questions only (no coding problems in exam answering)
  const items: ExamItem[] = useMemo(() =>
    examQuestions.map((q) => ({ kind: "question" as const, data: q })),
    [examQuestions]
  );

  const answeredIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, value] of Object.entries(answers)) {
      if (value !== undefined && value !== null && value !== "") {
        if (Array.isArray(value) && value.length === 0) continue;
        ids.add(id);
      }
    }
    return ids;
  }, [answers]);

  // Fetch exam questions
  useEffect(() => {
    if (!contestId) return;
    setLoadingQuestions(true);
    getExamQuestions(contestId)
      .then(setExamQuestions)
      .catch(() => setExamQuestions([]))
      .finally(() => setLoadingQuestions(false));
  }, [contestId]);

  // Load existing answers on mount
  useEffect(() => {
    if (!contestId) return;
    getMyExamAnswers(contestId)
      .then((savedAnswers) => {
        const map: Record<string, unknown> = {};
        for (const a of savedAnswers) {
          // Unwrap: answer is { selected: "A" } or { text: "..." }
          const val = a.answer;
          if ("selected" in val) map[a.questionId] = val.selected;
          else if ("text" in val) map[a.questionId] = val.text;
          else map[a.questionId] = val;
        }
        setAnswers(map);
      })
      .catch(() => {/* ignore - start fresh */});
  }, [contestId]);

  // Heartbeat every 30s
  useInterval(() => {
    heartbeat().catch(() => {/* logged elsewhere */});
  }, isInProgress ? 30000 : null);

  // Auto-submit when time expires
  useEffect(() => {
    if (countdown.remaining === 0 && isInProgress && contestId) {
      navigate(`/contests/${contestId}/exam-v2/submit-review`);
    }
  }, [countdown.remaining, isInProgress, contestId, navigate]);

  // Slide animation
  const handleSetActiveIndex = useCallback((newIndex: number | ((prev: number) => number)) => {
    setActiveIndex((prev) => {
      const next = typeof newIndex === "function" ? newIndex(prev) : newIndex;
      if (next !== prev) {
        setSlideDir(next > prev ? "right" : "left");
        setAnimating(true);
      }
      prevIndexRef.current = prev;
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

  // Answer change handler with auto-save
  const handleAnswerChange = useCallback((questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));

    // Debounced auto-save
    if (!contestId) return;
    const existing = pendingSaves.current.get(questionId);
    if (existing) clearTimeout(existing);

    const timeout = setTimeout(() => {
      // Wrap value for API
      const answerPayload = typeof value === "string"
        ? { text: value }
        : { selected: value };
      submitExamAnswer(contestId, questionId, answerPayload).catch(() => {
        // silently fail — student can retry
      });
      pendingSaves.current.delete(questionId);
    }, AUTO_SAVE_DELAY);
    pendingSaves.current.set(questionId, timeout);
  }, [contestId]);

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
          {!isInProgress && (
            <Tag size="sm" type="red">考試未開始</Tag>
          )}
        </div>
        <div className={styles.toolbarCenter}>
          <div className={styles.timer}>
            <Time size={16} />
            <span className={styles.timerText}>{countdown.display}</span>
          </div>
          <Button
            kind="primary" size="sm" renderIcon={SendFilled}
            onClick={() => contestId && navigate(`/contests/${contestId}/exam-v2/submit-review`)}
          >交卷</Button>
        </div>
      </div>

      {/* Mode switcher */}
      <div className={styles.modeSwitcher}>
        {VIEW_MODES.map((m) => (
          <Tooltip key={m.key} label={m.label} align="left">
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

export default ExamV2AnsweringScreen;
