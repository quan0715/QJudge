import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button, Tooltip } from "@carbon/react";
import {
  ArrowLeft,
  ArrowRight,
  CenterToFit,
  ListBulleted,
  List,
} from "@carbon/icons-react";
import { ExamNavigator } from "./ExamNavigator";
import type { ExamItem, ExamViewMode } from "../../types/exam.types";

const VIEW_MODES: { key: ExamViewMode; label: string; icon: typeof CenterToFit }[] = [
  { key: "single", label: "逐題模式", icon: CenterToFit },
  { key: "all", label: "全題模式", icon: ListBulleted },
];

function useScrollDirection(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => {
      const y = el.scrollTop;
      if (y < 10) {
        setVisible(true);
      } else if (y < lastY.current) {
        setVisible(true);
      } else if (y > lastY.current + 5) {
        setVisible(false);
      }
      lastY.current = y;
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);

  return visible;
}

interface PaperExamCoreProps {
  items: ExamItem[];
  answeredIds: Set<string>;
  toolbarLeft: React.ReactNode;
  toolbarCenter?: React.ReactNode;
  renderItem: (item: ExamItem, index: number, mode: ExamViewMode) => React.ReactNode;
  styles: Record<string, string>;
  syncIndex?: number | null;
}

export const PaperExamCore: React.FC<PaperExamCoreProps> = ({
  items,
  answeredIds,
  toolbarLeft,
  toolbarCenter,
  renderItem,
  styles,
  syncIndex,
}) => {
  const [viewMode, setViewMode] = useState<ExamViewMode>("single");
  const [activeIndex, setActiveIndex] = useState(0);
  const [allModeActiveIndex, setAllModeActiveIndex] = useState(0);
  const [navVisible, setNavVisible] = useState(true);
  const [slideDir, setSlideDir] = useState<"left" | "right">("right");
  const [animating, setAnimating] = useState(false);

  const questionAreaRef = useRef<HTMLDivElement>(null);
  const allContentRef = useRef<HTMLDivElement>(null);
  const allItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

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
    if (items.length === 0) return;
    setActiveIndex((prev) => Math.min(prev, items.length - 1));
    setAllModeActiveIndex((prev) => Math.min(prev, items.length - 1));
  }, [items.length]);

  useEffect(() => {
    if (syncIndex == null) return;
    if (syncIndex < 0 || syncIndex >= items.length) return;
    setViewMode("single");
    handleSetActiveIndex(syncIndex);
  }, [syncIndex, items.length, handleSetActiveIndex]);

  useEffect(() => {
    if (!animating) return;
    const t = setTimeout(() => setAnimating(false), 300);
    return () => clearTimeout(t);
  }, [animating, activeIndex]);

  useEffect(() => {
    questionAreaRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeIndex]);

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
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = idx;
        }
      });

      setAllModeActiveIndex(closestIdx);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener("scroll", onScroll);
  }, [viewMode, items.length]);

  const singleScrollVisible = useScrollDirection(questionAreaRef);
  const allScrollVisible = useScrollDirection(allContentRef);
  const toolbarVisible = viewMode === "single" ? singleScrollVisible : allScrollVisible;

  const handleScrollToItem = useCallback((index: number) => {
    const el = allItemRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const renderSingleMode = () => {
    const item = items[activeIndex];
    if (!item) return null;
    const isLast = activeIndex === items.length - 1;
    const slideClass = animating
      ? slideDir === "right"
        ? styles.slideInRight
        : styles.slideInLeft
      : "";

    return (
      <div className={styles.singleContent}>
        <div className={styles.questionArea} ref={questionAreaRef}>
          <div className={`${styles.questionInner} ${slideClass}`} key={activeIndex}>
            {renderItem(item, activeIndex, "single")}
          </div>
        </div>
        <div className={styles.navButtons}>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ArrowLeft}
            disabled={activeIndex === 0}
            onClick={() => handleSetActiveIndex((i) => i - 1)}
          >
            上一題
          </Button>
          <span className={styles.navInfo}>
            {activeIndex + 1} / {items.length}
          </span>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ArrowRight}
            disabled={isLast}
            onClick={() => handleSetActiveIndex((i) => i + 1)}
          >
            下一題
          </Button>
        </div>
      </div>
    );
  };

  const renderAllMode = () => (
    <div className={styles.allContent} ref={allContentRef}>
      <div className={styles.allSpacer} />
      {items.map((item, index) => {
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
            {renderItem(item, index, "all")}
          </div>
        );
      })}
      <div className={styles.allSpacer} />
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={`${styles.toolbar} ${toolbarVisible ? "" : styles.toolbarHidden}`}>
        <div className={styles.toolbarLeft}>{toolbarLeft}</div>
        <div className={styles.toolbarCenter}>{toolbarCenter}</div>
      </div>

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

export default PaperExamCore;
