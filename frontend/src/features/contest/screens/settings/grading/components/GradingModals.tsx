import { Modal, TextArea } from "@carbon/react";
import { useTranslation } from "react-i18next";
import styles from "./GradingModals.module.scss";

interface BaseModalProps {
  open: boolean;
  onClose(): void;
}

export interface BulkRevertModalProps extends BaseModalProps {
  count: number;
  submitting: boolean;
  onConfirm(): void;
}

export function BulkRevertModal({ open, onClose, count, submitting, onConfirm }: BulkRevertModalProps) {
  const { t } = useTranslation("contest");
  return (
    <Modal
      open={open}
      modalHeading={t("grading.bulkRevertHeading", "撤回已送出評分")}
      primaryButtonText={t("grading.bulkRevertConfirm", "確認撤回")}
      secondaryButtonText={t("common.cancel", "取消")}
      onRequestClose={onClose}
      onRequestSubmit={onConfirm}
      primaryButtonDisabled={submitting || count === 0}
      danger
    >
      <p>
        {t(
          "grading.bulkRevertSummary",
          "將撤回 {{count}} 筆已送出的評分，學生端會回到未評分狀態，AI 建議會保留可再次編輯或送出。",
          { count },
        )}
      </p>
    </Modal>
  );
}

export interface BulkSubmitModalProps extends BaseModalProps {
  count: number;
  submitting: boolean;
  onConfirm(): void;
}

export function BulkSubmitModal({ open, onClose, count, submitting, onConfirm }: BulkSubmitModalProps) {
  const { t } = useTranslation("contest");
  return (
    <Modal
      open={open}
      modalHeading={t("grading.bulkSubmitHeading", "批量送出 AI 建議")}
      primaryButtonText={t("grading.bulkSubmitConfirm", "確認送出")}
      secondaryButtonText={t("common.cancel", "取消")}
      onRequestClose={onClose}
      onRequestSubmit={onConfirm}
      primaryButtonDisabled={submitting || count === 0}
    >
      <p>
        {t("grading.bulkSubmitSummary", "將把 {{count}} 筆 AI 建議送出為正式評分，送出後可於學生端查看。", {
          count,
        })}
      </p>
    </Modal>
  );
}

export interface RegradeChoiceModalProps extends BaseModalProps {
  onReuseSession(): void;
  onNewSession(): void;
}

export function RegradeChoiceModal({
  open,
  onClose,
  onReuseSession,
  onNewSession,
}: RegradeChoiceModalProps) {
  const { t } = useTranslation("contest");
  return (
    <Modal
      open={open}
      modalHeading={t("grading.regradeChoiceHeading", "重新批改")}
      primaryButtonText={t("grading.regradeReuseSession", "沿用目前 session")}
      secondaryButtonText={t("grading.regradeNewSession", "建立新 session")}
      onRequestClose={onClose}
      onRequestSubmit={onReuseSession}
      onSecondarySubmit={onNewSession}
    >
      <p>
        {t(
          "grading.regradeChoiceDescription",
          "要在目前 AI session 中重新批改，或建立一個全新的 session？沿用現有 session 會保留 rubric 與對話紀錄，並在同一份 grade.csv 上重批；建立新 session 則會從空白 grade.csv 重新開始。",
        )}
      </p>
    </Modal>
  );
}

export interface RetryGradingModalProps extends BaseModalProps {
  count: number;
  running: boolean;
  note: string;
  onNoteChange(note: string): void;
  onConfirm(): void;
}

export function RetryGradingModal({
  open,
  onClose,
  count,
  running,
  note,
  onNoteChange,
  onConfirm,
}: RetryGradingModalProps) {
  const { t } = useTranslation("contest");
  return (
    <Modal
      open={open}
      modalHeading={t("grading.retryAiGrading", "重新批改")}
      primaryButtonText={t("grading.startRetryAiGrading", "送出重新批改")}
      secondaryButtonText={t("common.cancel", "取消")}
      onRequestClose={onClose}
      onRequestSubmit={onConfirm}
      primaryButtonDisabled={running || count === 0}
    >
      <div className={styles.retryModalBody}>
        <p className={styles.retryModalSummary}>
          {t("grading.retryModalSummary", "將重新批改 {{count}} 筆作答。", { count })}
        </p>
        <TextArea
          id="ai-grading-retry-note"
          labelText={t("grading.retryNoteLabel", "重新批改建議")}
          placeholder={t(
            "grading.retryNotePlaceholder",
            "例如：請更嚴格檢查是否提到關鍵概念，或針對第 2 點重新評估。",
          )}
          rows={5}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </div>
    </Modal>
  );
}
