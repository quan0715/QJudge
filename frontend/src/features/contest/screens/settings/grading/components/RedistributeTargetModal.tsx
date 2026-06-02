/**
 * RedistributeTargetModal — modal for selecting target questions when
 * setting a question to "配分重分配" (redistribute) policy.
 */
import { useState, useCallback } from "react";
import { Modal, Checkbox, InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";

interface TargetQuestion {
  id: string;
  order: number;
  prompt: string;
  score: number;
}

interface RedistributeTargetModalProps {
  open: boolean;
  questionIndex: number;
  availableTargets: TargetQuestion[];
  onClose: () => void;
  onConfirm: (targetIds: string[]) => void;
  submitting?: boolean;
}

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

  const handleToggle = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    // If distribute to all, pass empty array (backend interprets as all normal questions)
    const targets = distributeToAll ? [] : Array.from(selectedIds);
    onConfirm(targets);
  }, [distributeToAll, selectedIds, onConfirm]);

  const handleClose = useCallback(() => {
    setSelectedIds(new Set());
    setDistributeToAll(true);
    onClose();
  }, [onClose]);

  const canSubmit = distributeToAll || selectedIds.size > 0;

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
          title={t("grading.scorePolicy.redistributeNote", {
            defaultValue: "答對此題的學生不會額外得分（原始答案不計入），分數僅從目標題目的表現比例計算。",
          })}
          style={{ marginBottom: "1rem" }}
        />

        <Checkbox
          id="redistribute-all"
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
            {availableTargets.map((q) => (
              <Checkbox
                key={q.id}
                id={`target-${q.id}`}
                labelText={`第 ${q.order + 1} 題 (${q.score}分) — ${q.prompt?.slice(0, 40) || "..."}`}
                checked={selectedIds.has(q.id)}
                onChange={(_, { checked }) => handleToggle(q.id, checked)}
                style={{ marginBottom: "0.25rem" }}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
