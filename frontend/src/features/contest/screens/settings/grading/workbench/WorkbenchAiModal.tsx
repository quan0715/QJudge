import { useEffect, useState } from "react";
import { Dropdown, InlineNotification, Modal, RadioButton, RadioButtonGroup } from "@carbon/react";
import { useCopilotModels, type CopilotModel } from "@copilot";
import { useTranslation } from "react-i18next";
import styles from "./GradingWorkbench.module.scss";

export type AiMode = "grade" | "suggest";
export type AiRange = "ungraded" | "all";

interface WorkbenchAiModalProps {
  open: boolean;
  scope: "exam" | "question";
  title: string;
  examSummary?: { questions: number; answers: number };
  ungradedCount: number;
  /** Answers a full regrade would touch: everything except manual grades. */
  regradeCount: number;
  /** False for question groups: suggestions grade one question at a time. */
  suggestAvailable: boolean;
  onClose(): void;
  onConfirm(choice: { mode: AiMode; range: AiRange; modelId?: string }): Promise<void>;
}

export function WorkbenchAiModal({
  open,
  scope,
  title,
  examSummary,
  ungradedCount,
  regradeCount,
  suggestAvailable,
  onClose,
  onConfirm,
}: WorkbenchAiModalProps) {
  const { t } = useTranslation("contest");
  const { models, selectedModelId } = useCopilotModels();
  const [mode, setMode] = useState<AiMode>("grade");
  const [range, setRange] = useState<AiRange>(ungradedCount > 0 ? "ungraded" : "all");
  const [modelId, setModelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!open) return;
    setMode("grade");
    setRange(ungradedCount > 0 ? "ungraded" : "all");
    setError(undefined);
  }, [open, ungradedCount]);
  const effectiveModelId = modelId ?? selectedModelId ?? models[0]?.id ?? undefined;
  const question = scope === "question";
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm({
        mode: question ? mode : "grade",
        range: question ? range : "ungraded",
        modelId: effectiveModelId,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const nothingToDo = question ? (range === "ungraded" ? ungradedCount : regradeCount) === 0 : !examSummary?.answers;
  return (
    <Modal
      open={open}
      size="sm"
      modalHeading={title}
      primaryButtonText={t("workbench.start", "開始")}
      secondaryButtonText={t("workbench.cancel", "取消")}
      primaryButtonDisabled={busy || nothingToDo}
      onRequestClose={onClose}
      onRequestSubmit={() => void submit()}
    >
      <div className={styles.aiModalBody}>
        {!question && examSummary && (
          <p>
            {t("workbench.examSummary", "批改 {{questions}} 題、共 {{answers}} 份未評分的作答，分數直接寫入成績。", {
              questions: examSummary.questions,
              answers: examSummary.answers,
            })}
          </p>
        )}
        {question && (
          <>
            <RadioButtonGroup
              legendText={t("workbench.mode", "方式")}
              name="workbench-ai-mode"
              orientation="vertical"
              valueSelected={mode}
              onChange={(value) => setMode(value as AiMode)}
            >
              <RadioButton id="workbench-ai-grade" value="grade" labelText={t("workbench.modeGrade", "批改：直接寫入成績")} />
              {suggestAvailable ? (
                <RadioButton
                  id="workbench-ai-suggest"
                  value="suggest"
                  labelText={t("workbench.modeSuggest", "建議：審查採用後才寫入")}
                />
              ) : null}
            </RadioButtonGroup>
            <RadioButtonGroup
              legendText={t("workbench.range", "範圍")}
              name="workbench-ai-range"
              orientation="vertical"
              valueSelected={range}
              onChange={(value) => setRange(value as AiRange)}
            >
              <RadioButton
                id="workbench-ai-ungraded"
                value="ungraded"
                disabled={ungradedCount === 0}
                labelText={t("workbench.rangeUngraded", "只批未評分的 {{count}} 份", { count: ungradedCount })}
              />
              <RadioButton
                id="workbench-ai-all"
                value="all"
                labelText={t("workbench.rangeAll", "全部重改 {{count}} 份，人工調整的不動", { count: regradeCount })}
              />
            </RadioButtonGroup>
          </>
        )}
        {models.length > 0 && (
          <Dropdown<CopilotModel>
            id="workbench-ai-model"
            titleText={t("workbench.model", "批改模型")}
            label={t("workbench.model", "批改模型")}
            items={[...models]}
            itemToString={(item) => item?.displayName ?? ""}
            selectedItem={models.find((model) => model.id === effectiveModelId)}
            onChange={({ selectedItem }) => setModelId(selectedItem?.id ?? null)}
          />
        )}
        {error && <InlineNotification kind="error" lowContrast hideCloseButton title={error} />}
      </div>
    </Modal>
  );
}
