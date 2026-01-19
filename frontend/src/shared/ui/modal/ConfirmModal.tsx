import type { ReactNode } from "react";
import { Modal } from "@carbon/react";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 通用確認對話框（Gate 1 / shared-ui）
 * - 僅處理 UI，不綁定資料
 * - 文案可由呼叫端注入 i18n 字串
 */
export const ConfirmModal = ({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) => (
  <Modal
    open={open}
    modalHeading={title}
    primaryButtonText={confirmLabel}
    secondaryButtonText={cancelLabel}
    danger={danger}
    onRequestSubmit={onConfirm}
    onRequestClose={onCancel}
  >
    {body}
  </Modal>
);

export default ConfirmModal;
