import React from "react";
import { Button, Layer, Tooltip } from "@carbon/react";
import { useTranslation } from "react-i18next";
// Import solver styles
import "../styles/_solver-menu.scss";

export interface ProblemMenuItem {
  id: string;
  label: string; // e.g. "A"
  title: string; // e.g. "Two Sum"
  isSolved: boolean;
}

interface ProblemMenuProps {
  problems: ProblemMenuItem[];
  selectedProblemId: string | null;
  onSelect: (problemId: string) => void;
}

/**
 * ProblemMenu - Displays problem selectors with the active label highlighted
 * Uses Carbon Layer for theming and BEM classes for styles
 */
export const ProblemMenu: React.FC<ProblemMenuProps> = ({
  problems,
  selectedProblemId,
  onSelect,
}) => {
  const { t } = useTranslation("common");
  return (
    <Layer className="solver-menu" role="navigation" aria-label="題目列表">
      <div className="solver-menu__list">
        {problems.map((p) => {
          const isActive = p.id === selectedProblemId;

          return (
            <Tooltip key={p.id} label={`${p.label}. ${p.title}${p.isSolved ? ` — ${t("status.solved")}` : ""}`} align="right">
              <Button
                kind="ghost"
                className="solver-menu__item"
                data-active={isActive}
                data-solved={p.isSolved}
                aria-current={isActive ? "true" : undefined}
                onClick={() => onSelect(p.id)}
              >
                <span className="solver-menu__label">{p.label}</span>
              </Button>
            </Tooltip>
          );
        })}
      </div>
    </Layer>
  );
};
