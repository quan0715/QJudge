import React, { useState } from "react";
import { Button, Accordion } from "@carbon/react";
import { Add } from "@carbon/icons-react";
import TestCaseAddModal from "./TestCaseAddModal";
import TestCaseItem from "./TestCaseItem";
import type { TestCaseItem as TestCaseItemType, TestCaseMode } from "./TestCaseTypes";

interface TestCaseListProps {
  items: TestCaseItemType[];
  mode?: TestCaseMode;
  readOnly?: boolean;

  // Edit actions
  onAdd?: (input: string, output: string, isHidden?: boolean, score?: number) => void;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, input: string, output: string, score?: number) => void;
  onToggleVisibility?: (id: string, isHidden: boolean) => void;
  onToggleSample?: (id: string, isSample: boolean) => void;

  // Add form control (for external control)
  isAdding?: boolean;
  onCancelAdd?: () => void;
}

export const TestCaseList: React.FC<TestCaseListProps> = ({
  items,
  mode = "solver",
  readOnly = false,
  onAdd,
  onDelete,
  onUpdate,
  onToggleVisibility,
  onToggleSample,
  isAdding: externalIsAdding,
  onCancelAdd,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Edit State (single active edit)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");
  const [editOutput, setEditOutput] = useState("");
  const [editScore, setEditScore] = useState(0);

  const isProblemMode = mode === "problem";
  const isSolverMode = mode === "solver";
  const isResultMode = mode === "result";

  const hasExternalAddControl =
    externalIsAdding !== undefined || onCancelAdd !== undefined;
  const isModalOpen = hasExternalAddControl
    ? externalIsAdding ?? false
    : isAddModalOpen;

  const openAddModal = () => {
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    onCancelAdd?.();
  };

  const handleAdd = (payload: {
    input: string;
    output: string;
    isHidden?: boolean;
    score?: number;
  }) => {
    if (!onAdd) return;
    onAdd(payload.input, payload.output, payload.isHidden, payload.score);
  };

  const startEdit = (item: TestCaseItemType) => {
    setEditingId(item.id);
    setEditInput(item.input);
    setEditOutput(item.output || "");
    setEditScore(item.score || 0);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditInput("");
    setEditOutput("");
    setEditScore(0);
  };

  const saveEdit = (id: string) => {
    if (onUpdate) {
      onUpdate(id, editInput, editOutput, editScore);
    }
    cancelEdit();
  };

  const isItemEditable = (item: TestCaseItemType) => {
    if (readOnly || isResultMode) return false;
    if (isProblemMode) return true;
    if (isSolverMode) return item.source === "custom";
    return false;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {!readOnly && !isResultMode && onAdd && !hasExternalAddControl && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--cds-border-subtle)",
            display: "flex",
            justifyContent: "flex-end",
            backgroundColor: "var(--cds-layer-01)",
          }}
        >
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Add}
            onClick={openAddModal}
          >
            新增測資
          </Button>
        </div>
      )}

      <TestCaseAddModal
        open={isModalOpen}
        mode={mode}
        onClose={closeAddModal}
        onSubmit={handleAdd}
      />

      <div>
        {items.length === 0 && (
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              color: "var(--cds-text-secondary)",
            }}
          >
            無測試案例
          </div>
        )}

        {items.length > 0 && (
          <Accordion align="start" size="lg">
            {items.map((item, index) => {
              const isEditing = editingId === item.id;
              const editable = isItemEditable(item);
              const deletable = editable && !!onDelete;

              return (
                <TestCaseItem
                  key={item.id}
                  item={item}
                  index={index}
                  mode={mode}
                  editable={editable}
                  deletable={deletable}
                  isEditing={isEditing}
                  editInput={editInput}
                  editOutput={editOutput}
                  editScore={editScore}
                  onEditInputChange={setEditInput}
                  onEditOutputChange={setEditOutput}
                  onEditScoreChange={setEditScore}
                  onStartEdit={() => startEdit(item)}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={() => saveEdit(item.id)}
                  onDelete={deletable ? () => onDelete?.(item.id) : undefined}
                  onToggleVisibility={
                    onToggleVisibility
                      ? (isHidden) => onToggleVisibility(item.id, isHidden)
                      : undefined
                  }
                  onToggleSample={
                    onToggleSample
                      ? (isSample) => onToggleSample(item.id, isSample)
                      : undefined
                  }
                />
              );
            })}
          </Accordion>
        )}
      </div>
    </div>
  );
};

export type { TestCaseItemType as TestCaseItem };
export default TestCaseList;
