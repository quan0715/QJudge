import { useState } from "react";
import { Dropdown, InlineNotification, Modal } from "@carbon/react";
import { useCopilotModels, type CopilotModel } from "@copilot";
import { useTranslation } from "react-i18next";
import styles from "./BatchGrading.module.scss";

interface BatchGradingStartModalProps {
  open: boolean;
  questionCount: number;
  answerCount: number;
  skippedCount: number;
  onClose(): void;
  onConfirm(modelId?: string): Promise<void>;
}

export function BatchGradingStartModal({
  open,
  questionCount,
  answerCount,
  skippedCount,
  onClose,
  onConfirm,
}: BatchGradingStartModalProps) {
  const { t } = useTranslation("contest");
  const { models, selectedModelId } = useCopilotModels();
  const [modelId, setModelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const effectiveModelId = modelId ?? selectedModelId ?? models[0]?.id ?? null;

  const handleSubmit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm(effectiveModelId ?? undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      size="sm"
      modalHeading={t("grading.batch.modalTitle")}
      primaryButtonText={t("grading.batch.modalConfirm")}
      secondaryButtonText={t("grading.batch.cancel")}
      primaryButtonDisabled={busy || answerCount === 0}
      onRequestClose={onClose}
      onRequestSubmit={() => void handleSubmit()}
    >
      <div className={styles.summary}>
        <p>
          {t("grading.batch.modalSummary", {
            questions: questionCount,
            answers: answerCount,
            skipped: skippedCount,
          })}
        </p>
        <p>{t("grading.batch.modalWriteWarning")}</p>
        <p>{t("grading.batch.modalBackground")}</p>
      </div>
      {error && <InlineNotification kind="error" lowContrast hideCloseButton title={error} />}
      {models.length > 0 && (
        <Dropdown<CopilotModel>
          id="batch-grading-model"
          titleText={t("grading.batch.model")}
          label={t("grading.batch.model")}
          items={[...models]}
          itemToString={(item) => item?.displayName ?? ""}
          selectedItem={models.find((model) => model.id === effectiveModelId)}
          onChange={({ selectedItem }) => setModelId(selectedItem?.id ?? null)}
        />
      )}
    </Modal>
  );
}
