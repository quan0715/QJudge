import React from "react";
import { Layer, Tag } from "@carbon/react";
import { Draggable } from "@carbon/icons-react";
import { useContentLanguage } from "@/shared/contexts/ContentLanguageContext";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import styles from "./CodingProblemPreviewCard.module.scss";

interface CodingProblemPreviewCardProps {
  label?: string;
  score?: number;
  problem: ProblemDetail;
  frozen?: boolean;
  onClick?: () => void;
  onPointerDownDrag?: (e: React.PointerEvent) => void;
}

const PLACEHOLDER = "待編輯";

const CodingProblemPreviewCard: React.FC<CodingProblemPreviewCardProps> = ({
  label,
  score,
  problem,
  frozen = false,
  onClick,
  onPointerDownDrag,
}) => {
  const { contentLanguage } = useContentLanguage();

  const handleClick = () => {
    if (!frozen && onClick) onClick();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (frozen) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  const translation =
    problem.translations?.find((tr) => tr.language === contentLanguage) ||
    (contentLanguage === "zh-TW"
      ? problem.translations?.find((tr) => tr.language === "zh-hant")
      : null) ||
    problem.translations?.[0];

  const description = translation?.description || problem.description;

  return (
    <Layer>
      <div
        className={`${styles.card} ${frozen ? styles.cardFrozen : styles.cardClickable}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role={frozen ? undefined : "button"}
        tabIndex={frozen ? undefined : 0}
      >
        {/* Drag handle */}
        {!frozen && onPointerDownDrag && (
          <div
            className={styles.dragIndicator}
            onPointerDown={(e) => {
              e.stopPropagation();
              onPointerDownDrag(e);
            }}
          >
            <Draggable size={16} />
          </div>
        )}

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {label && <span className={styles.label}>{label}</span>}
            <span className={styles.title}>{problem.title || "Untitled"}</span>
          </div>
          <div className={styles.tags}>
            {problem.difficulty && (
              <Tag
                type={
                  problem.difficulty === "easy"
                    ? "green"
                    : problem.difficulty === "medium"
                      ? "blue"
                      : "red"
                }
                size="sm"
              >
                {problem.difficulty}
              </Tag>
            )}
            {score != null && (
              <Tag type="high-contrast" size="sm">{score} pt</Tag>
            )}
          </div>
        </div>

        {/* Description */}
        <div className={styles.body}>
          {description ? (
            <div className={styles.descriptionContent}>
              <MarkdownRenderer enableMath enableHighlight>{description}</MarkdownRenderer>
            </div>
          ) : (
            <span className={styles.placeholder}>{PLACEHOLDER}</span>
          )}
        </div>
      </div>
    </Layer>
  );
};

export default CodingProblemPreviewCard;
