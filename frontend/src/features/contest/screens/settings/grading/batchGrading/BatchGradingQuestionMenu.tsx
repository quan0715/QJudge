import { useState } from "react";
import { InlineNotification, Modal, OverflowMenu, OverflowMenuItem, TextArea } from "@carbon/react";
import { MachineLearningModel } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { BatchQuestionFiles } from "./batchGradingApi";
import { BATCH_ACTIVE_STATUSES, type BatchQuestionState } from "./batchGradingModel";
import { BatchGradingFilesModal } from "./BatchGradingFilesModal";

interface BatchGradingQuestionMenuProps {
  state: BatchQuestionState;
  onRevert(questionId: string): Promise<unknown>;
  onRegrade(questionId: string, note?: string): Promise<void>;
  /** Loads the AI's rubric and grade CSV for the read-only viewer. */
  onLoadFiles?(questionId: string): Promise<BatchQuestionFiles>;
}

export function BatchGradingQuestionMenu({
  state,
  onRevert,
  onRegrade,
  onLoadFiles,
}: BatchGradingQuestionMenuProps) {
  const { t } = useTranslation("contest");
  const [dialog, setDialog] = useState<"revert" | "regrade" | "files" | null>(null);
  const [files, setFiles] = useState<BatchQuestionFiles>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!state.runId) return null;
  const active = BATCH_ACTIVE_STATUSES.includes(state.status);

  const openDialog = (next: "revert" | "regrade" | "files" | null) => {
    setError(undefined);
    setDialog(next);
  };

  const openFiles = () => {
    if (!onLoadFiles) return;
    setFiles(undefined);
    openDialog("files");
    onLoadFiles(state.questionId).then(setFiles, (err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      setDialog(null);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const errorNotice = error && (
    <InlineNotification kind="error" lowContrast hideCloseButton title={error} />
  );

  return (
    <>
      <OverflowMenu
        size="sm"
        flipped
        renderIcon={MachineLearningModel}
        aria-label={t("grading.batch.menu")}
        iconDescription={t("grading.batch.menu")}
      >
        {onLoadFiles && (
          <OverflowMenuItem itemText={t("grading.batch.files")} onClick={openFiles} />
        )}
        <OverflowMenuItem
          itemText={t("grading.batch.regrade")}
          disabled={active}
          onClick={() => openDialog("regrade")}
        />
        <OverflowMenuItem
          itemText={t("grading.batch.revert")}
          disabled={active}
          isDelete
          onClick={() => openDialog("revert")}
        />
      </OverflowMenu>
      <Modal
        open={dialog === "revert"}
        danger
        size="sm"
        modalHeading={t("grading.batch.revertTitle", { label: state.label })}
        primaryButtonText={t("grading.batch.revertConfirm")}
        secondaryButtonText={t("grading.batch.cancel")}
        primaryButtonDisabled={busy}
        onRequestClose={() => openDialog(null)}
        onRequestSubmit={() => void run(() => onRevert(state.questionId))}
      >
        <p>{t("grading.batch.revertBody")}</p>
        {dialog === "revert" && errorNotice}
      </Modal>
      <Modal
        open={dialog === "regrade"}
        size="sm"
        modalHeading={t("grading.batch.regradeTitle", { label: state.label })}
        primaryButtonText={t("grading.batch.regradeConfirm")}
        secondaryButtonText={t("grading.batch.cancel")}
        primaryButtonDisabled={busy}
        onRequestClose={() => openDialog(null)}
        onRequestSubmit={() => void run(() => onRegrade(state.questionId, note.trim() || undefined))}
      >
        <p>{t("grading.batch.regradeBody")}</p>
        {dialog === "regrade" && errorNotice}
        <TextArea
          id={`batch-regrade-note-${state.questionId}`}
          labelText={t("grading.batch.regradeNote")}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
        />
      </Modal>
      <BatchGradingFilesModal
        open={dialog === "files"}
        state={state}
        files={files}
        error={dialog === "files" ? error : undefined}
        onClose={() => openDialog(null)}
      />
    </>
  );
}
