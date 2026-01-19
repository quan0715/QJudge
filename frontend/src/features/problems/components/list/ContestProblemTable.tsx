import React from "react";
import { Button, Tag } from "@carbon/react";
import { TrashCan } from "@carbon/icons-react";
import { DifficultyBadge } from "@/shared/ui/tag";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import "./ContestProblemTable.scss";

interface ContestProblemTableProps {
  problems: ContestProblemSummary[];
  onRemove?: (problemId: string) => void;
  onRowClick?: (problem: ContestProblemSummary) => void;
}

const ContestProblemTable: React.FC<ContestProblemTableProps> = ({
  problems,
  onRemove,
  onRowClick,
}) => {
  return (
    <div className="contest-problem-table">
      <div className="contest-problem-table__header">
        <div className="contest-problem-table__col--label">標號</div>
        <div className="contest-problem-table__col--title">標題</div>
        <div className="contest-problem-table__col--difficulty">難度</div>
        <div className="contest-problem-table__col--score">分數</div>
        {onRemove && (
          <div className="contest-problem-table__col--actions"></div>
        )}
      </div>

      {problems.map((problem) => (
        <div
          key={problem.id}
          className="contest-problem-table__row"
          onClick={() => onRowClick?.(problem)}
          style={{ cursor: onRowClick ? "pointer" : "default" }}
        >
          <div className="contest-problem-table__col--label">
            <Tag type="cyan">{problem.label || "-"}</Tag>
          </div>
          <div className="contest-problem-table__col--title">
            {problem.title}
          </div>
          <div className="contest-problem-table__col--difficulty">
            <DifficultyBadge difficulty={problem.difficulty || "medium"} />
          </div>
          <div className="contest-problem-table__col--score">
            {problem.score ?? "-"}
          </div>
          {onRemove && (
            <div className="contest-problem-table__col--actions">
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={TrashCan}
                iconDescription="移除題目"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(problem.id.toString());
                }}
                tooltipPosition="left"
              />
            </div>
          )}
        </div>
      ))}

      {problems.length === 0 && (
        <div className="contest-problem-table__empty">尚無題目，請新增題目</div>
      )}
    </div>
  );
};

export default ContestProblemTable;
