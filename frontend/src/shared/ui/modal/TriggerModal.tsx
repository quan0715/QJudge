import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";

export interface TriggerModalHandle {
  open: () => void;
  close: () => void;
}

export interface TriggerModalProps {
  trigger?: React.ReactElement;
  renderTrigger?: (controls: { open: () => void }) => React.ReactNode;
  renderModal: (controls: { open: boolean; onClose: () => void }) => React.ReactNode;
  initialOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * TriggerModal - tiny controller for modal open/close state.
 * It does not render any UI by itself; you provide trigger and modal renderers.
 */
const TriggerModal = forwardRef<TriggerModalHandle, TriggerModalProps>(({
  trigger,
  renderTrigger,
  renderModal,
  initialOpen = false,
  onOpenChange,
}, ref) => {
  const [open, setOpen] = useState(initialOpen);

  const handleOpen = useCallback(() => {
    setOpen(true);
    onOpenChange?.(true);
  }, [onOpenChange]);

  const handleClose = useCallback(() => {
    setOpen(false);
    onOpenChange?.(false);
  }, [onOpenChange]);

  useImperativeHandle(
    ref,
    () => ({
      open: handleOpen,
      close: handleClose,
    }),
    [handleOpen, handleClose]
  );

  const triggerNode = useMemo(() => {
    if (renderTrigger) {
      return renderTrigger({ open: handleOpen });
    }
    if (!trigger) return null;

    const originalOnClick = trigger.props.onClick;
    return React.cloneElement(trigger, {
      onClick: (event: React.MouseEvent) => {
        if (typeof originalOnClick === "function") {
          originalOnClick(event);
        }
        handleOpen();
      },
    });
  }, [handleOpen, renderTrigger, trigger]);

  return (
    <>
      {triggerNode}
      {renderModal({ open, onClose: handleClose })}
    </>
  );
});

TriggerModal.displayName = "TriggerModal";

export default TriggerModal;
