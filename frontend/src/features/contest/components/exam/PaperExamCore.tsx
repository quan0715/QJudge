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
  onActiveIndexChange?: (prevIndex: number, nextIndex: number) => void;
}

export const PaperExamCore: React.FC<PaperExamCoreProps> = ({
  items,
  answeredIds,
  toolbarLeft,
  toolbarCenter,
  renderItem,
  styles,
  syncIndex,
  onActiveIndexChange,
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
  const maxIndex = items.length > 0 ? items.length - 1 : 0;
  const isSyncIndexActive = syncIndex != null && syncIndex >= 0 && syncIndex < items.length;
  const effectiveViewMode = isSyncIndexActive ? "single" : viewMode;
  const effectiveActiveIndex = isSyncIndexActive ? syncIndex : Math.min(activeIndex, maxIndex);
  const effectiveAllModeActiveIndex = Math.min(allModeActiveIndex, maxIndex);

  const clampIndex = useCallback(
    (index: number) => {
      if (items.length === 0) return 0;
      return Math.min(Math.max(index, 0), items.length - 1);
    },
    [items.length],
  );

  const handleSetActiveIndex = useCallback((newIndex: number | ((prev: number) => number)) => {
    setActiveIndex((prev) => {
      const current = clampIndex(prev);
      const requested = typeof newIndex === "function" ? newIndex(current) : newIndex;
      const next = clampIndex(requested);
      if (next !== current) {
        setSlideDir(next > current ? "right" : "left");
        setAnimating(true);
        onActiveIndexChange?.(current, next);
      }
      return next;
    });
  }, [clampIndex, onActiveIndexChange]);

  useEffect(() => {
    if (!animating) return;
    const t = setTimeout(() => setAnimating(false), 300);
    return () => clearTimeout(t);
  }, [animating, effectiveActiveIndex]);

  useEffect(() => {
    questionAreaRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [effectiveActiveIndex]);

  useEffect(() => {
    if (effectiveViewMode !== "all") return;
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
  }, [effectiveViewMode, items.length]);

  const singleScrollVisible = useScrollDirection(questionAreaRef);
  const allScrollVisible = useScrollDirection(allContentRef);
  const toolbarVisible = effectiveViewMode === "single" ? singleScrollVisible : allScrollVisible;

  const handleScrollToItem = useCallback((index: number) => {
    const el = allItemRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const renderSingleMode = () => {
    const item = items[effectiveActiveIndex];
    if (!item) return null;
    const isLast = effectiveActiveIndex === items.length - 1;
    const slideClass = animating
      ? slideDir === "right"
        ? styles.slideInRight
        : styles.slideInLeft
      : "";

    return (
      <div className={styles.singleContent}>
        <div className={styles.questionArea} ref={questionAreaRef}>
          <div className={`${styles.questionInner} ${slideClass}`} key={effectiveActiveIndex}>
            {renderItem(item, effectiveActiveIndex, "single")}
          </div>
        </div>
        <div className={styles.navButtons}>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ArrowLeft}
            disabled={effectiveActiveIndex === 0}
            onClick={() => handleSetActiveIndex((i) => i - 1)}
          >
            上一題
          </Button>
          <span className={styles.navInfo}>
            {effectiveActiveIndex + 1} / {items.length}
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
        const dimClass = index !== effectiveAllModeActiveIndex ? styles.allItemDimmed : "";
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
              className={`${styles.modeBtn} ${effectiveViewMode === m.key ? styles.modeBtnActive : ""}`}
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
              activeIndex={effectiveViewMode === "single" ? effectiveActiveIndex : effectiveAllModeActiveIndex}
              answeredIds={answeredIds}
              onSelect={effectiveViewMode === "single" ? handleSetActiveIndex : handleScrollToItem}
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

        {effectiveViewMode === "single" ? renderSingleMode() : renderAllMode()}
      </div>
    </div>
  );
};

export default PaperExamCore;
