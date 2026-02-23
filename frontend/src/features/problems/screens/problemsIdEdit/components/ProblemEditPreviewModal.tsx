import React from "react";
import { Modal } from "@carbon/react";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import { ProblemPreview } from "@/shared/ui/problem";

interface ProblemEditPreviewModalProps {
  open: boolean;
  onClose: () => void;
  previewData: ProblemDetail;
}

const ProblemEditPreviewModal: React.FC<ProblemEditPreviewModalProps> = ({
  open,
  onClose,
  previewData,
}) => {
  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      modalHeading="題目預覽"
      passiveModal
      size="lg"
      className="problem-edit-page__preview-modal"
    >
      <ProblemPreview problem={previewData} compact />
    </Modal>
  );
};

export default ProblemEditPreviewModal;
