import React from "react";
import {
  TableRow,
  TableCell,
  Button,
  Tag,
} from "@carbon/react";
import {
  Edit,
  TrashCan,
  CheckmarkOutline,
  CaretUp,
  CaretDown,
  Close,
} from "@carbon/icons-react";
import { Link } from "react-router-dom";
import { DifficultyBadge } from "@/shared/ui/tag";
import ProblemTagList from "./ProblemTagList";
import type { ProblemRowData } from "./ProblemTable";

interface ProblemTableRowProps {
  rowKey: string;
  rowProps: React.HTMLAttributes<HTMLTableRowElement>;
  mode: "admin" | "contest" | "student" | "lab";
  problem: ProblemRowData;
  onRowClick?: (problem: ProblemRowData) => void;
  onAction?: (action: string, problem: ProblemRowData) => void;
}

const getAcceptanceRate = (problem: ProblemRowData) => {
  if (!problem.submissionCount) return "0%";
  return `${(((problem.acceptedCount || 0) / problem.submissionCount) * 100).toFixed(1)}%`;
};

const ProblemTableRow: React.FC<ProblemTableRowProps> = ({
  rowKey,
  rowProps,
  mode,
  problem,
  onRowClick,
  onAction,
}) => {
  return (
    <TableRow
      key={rowKey}
      {...rowProps}
      onClick={() => onRowClick?.(problem)}
      style={onRowClick ? { cursor: "pointer" } : undefined}
      className={onRowClick ? "clickable-row" : undefined}
    >
      {mode === "contest" ? (
        <>
          <TableCell>
            <Tag type="cyan">{problem.label}</Tag>
          </TableCell>
          <TableCell>{problem.title}</TableCell>
          <TableCell>
            <DifficultyBadge difficulty={problem.difficulty || "medium"} />
          </TableCell>
          <TableCell>
            <ProblemTagList tags={problem.tags} />
          </TableCell>
          <TableCell>{problem.score}</TableCell>
          {onAction && (
            <TableCell>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <Button
                  kind="ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={CaretUp}
                  iconDescription="往上移動"
                  tooltipPosition="bottom"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.("move_up", problem);
                  }}
                />
                <Button
                  kind="ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={CaretDown}
                  iconDescription="往下移動"
                  tooltipPosition="bottom"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.("move_down", problem);
                  }}
                />
                <div
                  style={{
                    width: "1px",
                    backgroundColor: "var(--cds-border-subtle)",
                    margin: "0 0.25rem",
                  }}
                />
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={TrashCan}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.("delete", problem);
                  }}
                  style={{ color: "var(--cds-text-error)" }}
                >
                  移除
                </Button>
              </div>
            </TableCell>
          )}
        </>
      ) : mode === "lab" ? (
        <>
          <TableCell>
            <div style={{ fontWeight: 500 }}>{problem.title}</div>
          </TableCell>
          <TableCell>
            <DifficultyBadge difficulty={problem.difficulty || "medium"} />
          </TableCell>
          <TableCell>
            <ProblemTagList tags={problem.tags} />
          </TableCell>
          <TableCell>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Edit}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.("edit", problem);
                }}
              >
                編輯
              </Button>
              <Button
                kind="danger--ghost"
                size="sm"
                renderIcon={Close}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.("remove", problem);
                }}
              >
                移除
              </Button>
            </div>
          </TableCell>
        </>
      ) : mode === "student" ? (
        <>
          <TableCell>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              {problem.isSolved && (
                <div
                  style={{
                    color: "var(--cds-support-success)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <CheckmarkOutline size={16} />
                </div>
              )}
              <Link
                to={`/problems/${problem.displayId || problem.id}`}
                style={{
                  textDecoration: "none",
                  color: "var(--cds-link-primary)",
                  fontWeight: 500,
                  fontSize: "1rem",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {problem.title}
              </Link>
            </div>
          </TableCell>
          <TableCell>
            <ProblemTagList tags={problem.tags} size="sm" />
          </TableCell>
          <TableCell>
            <DifficultyBadge difficulty={problem.difficulty || "medium"} />
          </TableCell>
          <TableCell>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>{getAcceptanceRate(problem)}</span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--cds-text-secondary)",
                  marginLeft: "0.5rem",
                }}
              >
                ({problem.acceptedCount || 0}/{problem.submissionCount || 0})
              </span>
            </div>
          </TableCell>
        </>
      ) : (
        <>
          <TableCell>
            <div style={{ fontWeight: 500 }}>{problem.title}</div>
          </TableCell>
          <TableCell>
            <DifficultyBadge difficulty={problem.difficulty || "medium"} />
          </TableCell>
          <TableCell>
            <ProblemTagList tags={problem.tags} />
          </TableCell>
          <TableCell>
            {problem.isVisible ? <Tag type="green">可見</Tag> : <Tag type="gray">隱藏</Tag>}
          </TableCell>
          <TableCell>
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Edit}
              onClick={(e) => {
                e.stopPropagation();
                onAction?.("edit", problem);
              }}
            >
              編輯
            </Button>
          </TableCell>
        </>
      )}
    </TableRow>
  );
};

export default ProblemTableRow;
