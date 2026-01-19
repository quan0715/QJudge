import React from "react";
import { Layer } from "@carbon/react";
import { ContainedList, ContainedListItem } from "@carbon/react";
import { CheckmarkFilled } from "@carbon/icons-react";
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
 * ProblemMenu - Displays a list of problems with sliding indicator
 * Uses Carbon Layer for theming and BEM classes for styles
 */
export const ProblemMenu: React.FC<ProblemMenuProps> = ({
  problems,
  selectedProblemId,
  onSelect,
}) => {
  // Find index for indicator calculation
  const selectedIndex = problems.findIndex((p) => p.id === selectedProblemId);

  // Calculate sliding indicator position (header height is 0)
  const indicatorTop =
    selectedIndex >= 0
      ? `calc(var(--solver-menu-row-height) * ${selectedIndex})`
      : "0px";

  return (
    <Layer className="solver-menu">
      {/* Sliding Indicator */}
      {selectedIndex >= 0 && (
        <div className="solver-menu__indicator" style={{ top: indicatorTop }} />
      )}

      <ContainedList isInset>
        {problems.map((p) => {
          const isActive = p.id === selectedProblemId;

          return (
            <ContainedListItem
              key={p.id}
              className="solver-menu__item"
              data-active={isActive}
              onClick={() => onSelect(p.id)}
            >
              <div className="solver-item-content">
                {p.isSolved ? (
                  <CheckmarkFilled
                    size={20}
                    fill="var(--cds-support-success)"
                  />
                ) : (
                  <span className="solver-menu__label">{p.label}</span>
                )}
              </div>
            </ContainedListItem>
          );
        })}
      </ContainedList>
    </Layer>
  );
};
