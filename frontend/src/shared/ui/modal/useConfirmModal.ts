import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmModalState extends ConfirmOptions {
  open: boolean;
}

export const useConfirmModal = () => {
  const [modalState, setModalState] = useState<ConfirmModalState>({
    open: false,
    title: "",
  });
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setModalState({ open: true, ...options });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setModalState((prev) => ({ ...prev, open: false }));
    resolverRef.current?.(true);
    resolverRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setModalState((prev) => ({ ...prev, open: false }));
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, []);

  return {
    confirm,
    modalProps: {
      open: modalState.open,
      title: modalState.title,
      body: modalState.body,
      confirmLabel: modalState.confirmLabel,
      cancelLabel: modalState.cancelLabel,
      danger: modalState.danger,
      onConfirm: handleConfirm,
      onCancel: handleCancel,
    },
  };
};
