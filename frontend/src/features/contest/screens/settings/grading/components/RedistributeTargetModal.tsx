/**
 * RedistributeTargetModal — modal for selecting target questions when
 * setting a question to "配分重分配" (redistribute) policy.
 */
import { useState, useCallback, useMemo } from "react";
import { Modal, Checkbox, InlineNotification, Tag, Button } from "@carbon/react";
import { useTranslation } from "react-i18next";

interface TargetQuestion {
  id: string;
  order: number;
  prompt: string;
  score: number;
  questionType?: string;
}

interface RedistributeTargetModalProps {
  open: boolean;
  questionIndex: number;
  availableTargets: TargetQuestion[];
  onClose: () => void;
  onConfirm: (targetIds: string[]) => void;
  submitting?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  single_choice: "單選",
  multiple_choice: "多選",
  true_false: "是非",
  short_answer: "簡答",
  essay: "申論",
};

export default function RedistributeTargetModal({
  open,
  questionIndex,
  availableTargets,
  onClose,
  onConfirm,
  submitting = false,
}: RedistributeTargetModalProps) {
  const { t } = useTranslation("contest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [distributeToAll, setDistributeToAll] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // Available question types for filter badges
  const availableTypes = useMemo(() => {
    const types = new Set(availableTargets.map((q) => q.questionType ?? "unknown"));
    return Array.from(types).filter((t) => t !== "unknown");
  }, [availableTargets]);

  // Filtered targets based on type filter
  const filteredTargets = useMemo(() => {
    if (!typeFilter) return availableTargets;
    return availableTargets.filter((q) => q.questionType === typeFilter);
  }, [availableTargets, typeFilter]);

  const handleToggle = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const q of filteredTargets) next.add(q.id);
      return next;
    });
  }, [filteredTargets]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const q of filteredTargets) next.delete(q.id);
      return next;
    });
  }, [filteredTargets]);

  const handleConfirm = useCallback(() => {
    const targets = distributeToAll ? [] : Array.from(selectedIds);
    onConfirm(targets);
  }, [distributeToAll, selectedIds, onConfirm]);

  const handleClose = useCallback(() => {
    setSelectedIds(new Set());
    setDistributeToAll(true);
    setTypeFilter(null);
    onClose();
  }, [onClose]);

  const canSubmit = distributeToAll || selectedIds.size > 0;
  const allFilteredSelected = filteredTargets.length > 0 && filteredTargets.every((q) => selectedIds.has(q.id));

  return (
    <Modal
      open={open}
      modalHeading={t("grading.scorePolicy.redistributeTitle", {
        index: questionIndex,
        defaultValue: "第 {{index}} 題 — 配分重分配",
      })}
      primaryButtonText={t("common.confirm", "確認")}
      secondaryButtonText={t("common.cancel", "取消")}
      onRequestClose={handleClose}
      onRequestSubmit={handleConfirm}
      primaryButtonDisabled={submitting || !canSubmit}
      size="md"
    >
      <div style={{ marginBottom: "1rem" }}>
        <p style={{ marginBottom: "0.75rem" }}>
          {t("grading.scorePolicy.redistributeDesc", {
            defaultValue:
              "此題的分數將按比例分配到目標題目上。得分較高的學生將獲得更多加分。",
          })}
        </p>

        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title=""
          subtitle={t("grading.scorePolicy.redistributeNote", {
            defaultValue: "此題不再計分，分數按目標題目原始配分比例重新分配。學生在目標題目的得分會等比放大。可隨時「恢復正常計分」撤銷。",
          })}
          style={{ marginBottom: "0.75rem" }}
        />

        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title=""
          subtitle={t("grading.scorePolicy.redistributeStackWarning", {
            defaultValue: "若多題同時重分配到相同目標，分數會疊加累計。",
          })}
          style={{ marginBottom: "1rem" }}
        />

        <Checkbox
          id={`redistribute-all-${questionIndex}`}
          labelText={t("grading.scorePolicy.redistributeToAll", {
            defaultValue: "分配到所有正常計分題目（等比例）",
          })}
          checked={distributeToAll}
          onChange={(_, { checked }) => setDistributeToAll(checked)}
        />

        {!distributeToAll && (
          <div style={{ marginTop: "0.75rem", paddingLeft: "1rem" }}>
            <p style={{ fontSize: "0.875rem", marginBottom: "0.5rem", color: "var(--cds-text-secondary)" }}>
              {t("grading.scorePolicy.selectTargets", {
                defaultValue: "選擇要接收分數的題目：",
              })}
            </p>

            {/* Type filter badges */}
            {availableTypes.length > 1 && (
              <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                <Tag
                  type={typeFilter === null ? "blue" : "cool-gray"}
                  size="sm"
                  onClick={() => setTypeFilter(null)}
                  style={{ cursor: "pointer" }}
                >
                  全部
                </Tag>
                {availableTypes.map((type) => (
                  <Tag
                    key={type}
                    type={typeFilter === type ? "blue" : "cool-gray"}
                    size="sm"
                    onClick={() => setTypeFilter(type === typeFilter ? null : type)}
                    style={{ cursor: "pointer" }}
                  >
                    {TYPE_LABELS[type] ?? type}
                  </Tag>
                ))}
              </div>
            )}

            {/* Select all / deselect all */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <Button
                kind="ghost"
                size="sm"
                onClick={handleSelectAll}
                disabled={allFilteredSelected}
              >
                {typeFilter ? `全選${TYPE_LABELS[typeFilter] ?? typeFilter}` : "全選"}
              </Button>
              <Button
                kind="ghost"
                size="sm"
                onClick={handleDeselectAll}
              >
                取消全選
              </Button>
              {selectedIds.size > 0 && (
                <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", alignSelf: "center" }}>
                  已選 {selectedIds.size} 題
                </span>
              )}
            </div>

            {/* Question checkboxes */}
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {filteredTargets.map((q) => (
                <Checkbox
                  key={q.id}
                  id={`target-${questionIndex}-${q.id}`}
                  labelText={`第 ${q.order + 1} 題 (${q.score}分) — ${q.prompt?.slice(0, 40) || "..."}`}
                  checked={selectedIds.has(q.id)}
                  onChange={(_, { checked }) => handleToggle(q.id, checked)}
                  style={{ marginBottom: "0.25rem" }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
