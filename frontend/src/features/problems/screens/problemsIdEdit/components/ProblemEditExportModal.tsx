import React from "react";
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
  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      onRequestSubmit={onConfirm}
      modalHeading="匯出題目"
      primaryButtonText="匯出"
      secondaryButtonText="取消"
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
              titleText="縮放比例"
              label="選擇縮放比例"
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
            將題目資料匯出為 YAML 格式，可用於備份或匯入至其他系統。
          </p>
        )}
      </div>
    </Modal>
  );
};

export default ProblemEditExportModal;
