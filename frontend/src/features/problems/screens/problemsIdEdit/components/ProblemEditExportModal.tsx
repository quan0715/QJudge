import React from "react";
import { useTranslation } from "react-i18next";
import { Modal, ContentSwitcher, Switch, Dropdown } from "@carbon/react";

interface ProblemEditExportModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  exportFormat: "pdf" | "yaml";
  onExportFormatChange: (format: "pdf" | "yaml") => void;
  pdfScale: number;
  onPdfScaleChange: (scale: number) => void;
}

const PDF_SCALE_OPTIONS = [
  { id: "50", text: "50%" },
  { id: "75", text: "75%" },
  { id: "100", text: "100%" },
  { id: "125", text: "125%" },
  { id: "150", text: "150%" },
];

const ProblemEditExportModal: React.FC<ProblemEditExportModalProps> = ({
  open,
  onClose,
  onConfirm,
  exportFormat,
  onExportFormatChange,
  pdfScale,
  onPdfScaleChange,
}) => {
  const { t } = useTranslation("problem");
  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      onRequestSubmit={onConfirm}
      modalHeading={t("edit.exportModal.title")}
      primaryButtonText={t("edit.exportModal.submit")}
      secondaryButtonText={t("edit.exportModal.cancel")}
      size="sm"
      className="problem-edit-page__export-modal"
    >
      <div className="problem-edit-page__export-content">
        <ContentSwitcher
          onChange={(e) => onExportFormatChange(e.name as "pdf" | "yaml")}
          selectedIndex={exportFormat === "pdf" ? 0 : 1}
          size="md"
          className="problem-edit-page__export-switcher"
        >
          <Switch name="pdf" text="PDF" />
          <Switch name="yaml" text="YAML" />
        </ContentSwitcher>

        {exportFormat === "pdf" && (
          <div className="problem-edit-page__export-options">
            <Dropdown
              id="pdf-scale"
              titleText={t("edit.exportModal.scaleLabel")}
              label={t("edit.exportModal.scalePlaceholder")}
              items={PDF_SCALE_OPTIONS}
              itemToString={(item) => (item ? item.text : "")}
              selectedItem={PDF_SCALE_OPTIONS.find(
                (option) => option.id === String(pdfScale)
              )}
              onChange={({ selectedItem }) => {
                if (selectedItem) {
                  onPdfScaleChange(Number(selectedItem.id));
                }
              }}
            />
          </div>
        )}

        {exportFormat === "yaml" && (
          <p className="problem-edit-page__export-description">
            {t("edit.exportModal.description")}
          </p>
        )}
      </div>
    </Modal>
  );
};

export default ProblemEditExportModal;
