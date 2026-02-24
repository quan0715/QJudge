import React from "react";
import {
  AccordionItem,
  Button,
  FormLabel,
  NumberInput,
  Tag,
  TextArea,
  Toggle,
} from "@carbon/react";
import { Edit, TrashCan, Locked } from "@carbon/icons-react";
import { SubmissionStatusBadge } from "@/shared/ui/tag";
import type { TestCaseItem as TestCaseItemType, TestCaseMode } from "./TestCaseTypes";

interface TestCaseItemProps {
  item: TestCaseItemType;
  index: number;
  mode: TestCaseMode;
  editable: boolean;
  deletable: boolean;
  isEditing: boolean;
  editInput: string;
  editOutput: string;
  editScore: number;
  onEditInputChange: (value: string) => void;
  onEditOutputChange: (value: string) => void;
  onEditScoreChange: (value: number) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete?: () => void;
  onToggleVisibility?: (isHidden: boolean) => void;
  onToggleSample?: (isSample: boolean) => void;
}

const TestCaseItem: React.FC<TestCaseItemProps> = ({
  item,
  index,
  mode,
  editable,
  deletable,
  isEditing,
  editInput,
  editOutput,
  editScore,
  onEditInputChange,
  onEditOutputChange,
  onEditScoreChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onToggleVisibility,
  onToggleSample,
}) => {
  const isProblemMode = mode === "problem";
  const isSolverMode = mode === "solver";
  const isResultMode = mode === "result";

  return (
    <AccordionItem
      key={item.id}
      title={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            paddingRight: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontWeight: 600, minWidth: "60px" }}>
              Case {index + 1}
            </span>

            {isProblemMode && (
              <Tag type="cyan" size="sm">
                {item.score ?? 0} 分
              </Tag>
            )}

            {isProblemMode && (
              <Tag type={item.isHidden ? "gray" : "blue"} size="sm">
                {item.isHidden ? "隱藏" : "公開"}
              </Tag>
            )}

            {isSolverMode && (
              <Tag type={item.source === "public" ? "blue" : "purple"} size="sm">
                {item.source === "public" ? "公開測資" : "自訂測資"}
              </Tag>
            )}

            {isResultMode && item.status && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <SubmissionStatusBadge status={item.status} size="sm" />
                {item.execTime !== undefined && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    {item.execTime}ms / {item.memoryUsage}KB
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      }
    >
      <div style={{ padding: "0.5rem 0" }}>
        {editable && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1rem",
              paddingBottom: "0.5rem",
              borderBottom: "1px solid var(--cds-border-subtle)",
            }}
          >
            <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
              {isProblemMode && onToggleVisibility && (
                <Toggle
                  id={`tc-visibility-${item.id}`}
                  labelText="可見性"
                  labelA="隱藏"
                  labelB="公開"
                  toggled={!(item.isHidden ?? false)}
                  onToggle={(checked) => onToggleVisibility(!checked)}
                  size="sm"
                />
              )}
              {isProblemMode && onToggleSample && (
                <Toggle
                  id={`tc-sample-${item.id}`}
                  labelText="範例測資"
                  labelA="否"
                  labelB="是"
                  toggled={item.isSample ?? false}
                  onToggle={(checked) => onToggleSample(checked)}
                  size="sm"
                />
              )}
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              {!isEditing && (
                <Button kind="ghost" size="sm" renderIcon={Edit} onClick={onStartEdit}>
                  編輯
                </Button>
              )}
              {deletable && (
                <Button
                  kind="danger--ghost"
                  size="sm"
                  renderIcon={TrashCan}
                  onClick={onDelete}
                >
                  刪除
                </Button>
              )}
            </div>
          </div>
        )}

        {isResultMode && item.errorMessage && (
          <div style={{ marginBottom: "1rem" }}>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--cds-support-error)",
                marginBottom: "0.25rem",
              }}
            >
              Error Message
            </div>
            <pre
              style={{
                padding: "0.5rem",
                backgroundColor: "var(--cds-layer-02)",
                color: "var(--cds-support-error)",
                fontSize: "0.8125rem",
                borderRadius: "4px",
              }}
            >
              {item.errorMessage}
            </pre>
          </div>
        )}

        {isEditing ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <FormLabel style={{ marginBottom: "0.25rem" }}>輸入 (Input)</FormLabel>
              <TextArea
                labelText=""
                rows={4}
                value={editInput}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  onEditInputChange(e.target.value)
                }
              />
            </div>
            <div>
              <FormLabel style={{ marginBottom: "0.25rem" }}>預期輸出 (Expected Output)</FormLabel>
              <TextArea
                labelText=""
                rows={4}
                value={editOutput}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  onEditOutputChange(e.target.value)
                }
              />
            </div>
            {isProblemMode && (
              <div style={{ gridColumn: "1 / -1" }}>
                <NumberInput
                  id={`edit-tc-score-${item.id}`}
                  label="分數 (Score)"
                  value={editScore}
                  onChange={(_e, { value }) => onEditScoreChange(Number(value))}
                  min={0}
                />
              </div>
            )}
            <div
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
              }}
            >
              <Button kind="secondary" size="sm" onClick={onCancelEdit}>
                取消
              </Button>
              <Button size="sm" onClick={onSaveEdit}>
                儲存變更
              </Button>
            </div>
          </div>
        ) : (
          <>
            {(item.isHidden || item.input === null || item.input === undefined) && isResultMode ? (
              <div
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  backgroundColor: "var(--cds-layer-01)",
                  borderRadius: "4px",
                  border: "1px solid var(--cds-border-subtle)",
                }}
              >
                <p
                  style={{
                    color: "var(--cds-text-secondary)",
                    fontSize: "0.875rem",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                  }}
                >
                  <Locked size={16} /> 這是隱藏測資，無法查看詳細內容
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                  backgroundColor: isResultMode ? "var(--cds-ui-02)" : "transparent",
                  padding: isResultMode ? "1rem" : "0",
                  borderRadius: "4px",
                }}
              >
                <div>
                  <FormLabel style={{ marginBottom: "0.25rem" }}>輸入 (Input)</FormLabel>
                  <pre
                    style={{
                      backgroundColor: "var(--cds-layer-01)",
                      padding: "0.75rem",
                      margin: 0,
                      borderRadius: "4px",
                      fontFamily: "var(--cds-code-01)",
                      fontSize: "0.8125rem",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      minHeight: "40px",
                      border: "1px solid var(--cds-border-subtle)",
                    }}
                  >
                    {item.input || "(empty)"}
                  </pre>
                </div>

                <div>
                  <FormLabel style={{ marginBottom: "0.25rem" }}>預期輸出 (Expected Output)</FormLabel>
                  <pre
                    style={{
                      backgroundColor: "var(--cds-layer-01)",
                      padding: "0.75rem",
                      margin: 0,
                      borderRadius: "4px",
                      fontFamily: "var(--cds-code-01)",
                      fontSize: "0.8125rem",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      minHeight: "40px",
                      border: "1px solid var(--cds-border-subtle)",
                    }}
                  >
                    {item.output || "(empty)"}
                  </pre>
                </div>

                {isResultMode && item.actualOutput !== undefined && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <FormLabel style={{ marginBottom: "0.25rem" }}>實際輸出 (Actual Output)</FormLabel>
                    <pre
                      style={{
                        backgroundColor: "var(--cds-layer-01)",
                        padding: "0.75rem",
                        margin: 0,
                        borderRadius: "4px",
                        fontFamily: "var(--cds-code-01)",
                        fontSize: "0.8125rem",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                        minHeight: "40px",
                        border: "1px solid var(--cds-border-subtle)",
                      }}
                    >
                      {item.actualOutput || "(empty)"}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AccordionItem>
  );
};

export default TestCaseItem;
