import { useState } from "react";
import {
  Modal,
  RadioButton,
  RadioButtonGroup,
  Dropdown,
  InlineLoading,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import { downloadContestFile } from "@/services/contest";

interface ContestDownloadModalProps {
  contestId: string;
  contestName: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Sanitize a string to be safe for use as a filename.
 */
const sanitizeFilename = (filename: string): string => {
  // Remove or replace invalid characters
  const sanitized = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  // Remove leading/trailing dots and spaces
  const trimmed = sanitized.trim().replace(/^[\s.]+|[\s.]+$/g, "");
  // Limit length
  const limited = trimmed.length > 200 ? trimmed.substring(0, 200) : trimmed;
  // Ensure not empty
  return limited || "contest";
};

export const ContestDownloadModal = ({
  contestId,
  contestName,
  open,
  onClose,
}: ContestDownloadModalProps) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const [format, setFormat] = useState<"pdf" | "markdown">("pdf");
  const [language, setLanguage] = useState<string>("zh-TW");
  const [scale, setScale] = useState<number>(1.0);
  const [loading, setLoading] = useState(false);

  const languageOptions = [
    { id: "zh-TW", label: "中文 (繁體)" },
    { id: "en", label: "English" },
  ];

  const scaleOptions = [
    { id: 0.5, label: "50%" },
    { id: 0.75, label: "75%" },
    { id: 1.0, label: "100%" },
    { id: 1.25, label: "125%" },
    { id: 1.5, label: "150%" },
    { id: 2.0, label: "200%" },
  ];

  const handleDownload = async () => {
    console.log(
      "Download requested with format:",
      format,
      "language:",
      language,
      "scale:",
      scale
    );
    setLoading(true);
    try {
      const blob = await downloadContestFile(
        contestId,
        format,
        language,
        scale
      );

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      const extension = format === "pdf" ? "pdf" : "md";
      const safeName = sanitizeFilename(contestName);
      const filename = `contest_${contestId}_${safeName}.${extension}`;
      link.setAttribute("download", filename);

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      // showToast({
      //   kind: 'success',
      //   title: 'Download successful',
      //   subtitle: `Contest file downloaded as ${format.toUpperCase()}`
      // });

      onClose();
    } catch (error) {
      console.error("Download failed:", error);
      // showToast({
      //   kind: 'error',
      //   title: 'Download failed',
      //   subtitle: error instanceof Error ? error.message : 'An error occurred during download'
      // });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      modalHeading={t("download.title")}
      primaryButtonText={t("download.downloadBtn")}
      secondaryButtonText={tc("button.cancel")}
      onRequestSubmit={handleDownload}
      primaryButtonDisabled={loading}
      size="sm"
    >
      <div style={{ marginBottom: "1.5rem" }}>
        <p style={{ marginBottom: "1rem", color: "var(--cds-text-secondary)" }}>
          {t("download.description")}
        </p>

        <div style={{ marginBottom: "1.5rem" }}>
          <label
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--cds-text-primary)",
            }}
          >
            {t("download.fileFormat")}
          </label>
          <RadioButtonGroup
            name="format"
            valueSelected={format}
            onChange={(value) => setFormat(value as "pdf" | "markdown")}
            orientation="vertical"
          >
            <RadioButton
              id="format-markdown"
              labelText={t("download.markdown")}
              value="markdown"
            />
            <RadioButton
              id="format-pdf"
              labelText={t("download.pdf")}
              value="pdf"
            />
          </RadioButtonGroup>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <Dropdown
            id="language-selector"
            titleText={t("download.language")}
            label={t("download.selectLanguage")}
            items={languageOptions}
            itemToString={(item) => (item ? item.label : "")}
            selectedItem={languageOptions.find((l) => l.id === language)}
            onChange={({ selectedItem }) => {
              if (selectedItem) {
                setLanguage(selectedItem.id);
              }
            }}
          />
        </div>

        {/* Scale option - only visible for PDF format */}
        {format === "pdf" && (
          <div style={{ marginBottom: "1.5rem" }}>
            <Dropdown
              id="scale-selector"
              titleText={t("download.scale")}
              label={t("download.selectScale")}
              items={scaleOptions}
              itemToString={(item) => (item ? item.label : "")}
              selectedItem={scaleOptions.find((s) => s.id === scale)}
              onChange={({ selectedItem }) => {
                if (selectedItem) {
                  setScale(selectedItem.id);
                }
              }}
            />
            <p
              style={{
                marginTop: "0.5rem",
                fontSize: "0.75rem",
                color: "var(--cds-text-secondary)",
              }}
            >
              {t("download.scaleHint")}
            </p>
          </div>
        )}

        {loading && (
          <div style={{ marginTop: "1rem" }}>
            <InlineLoading description={t("download.generating")} />
          </div>
        )}
      </div>
    </Modal>
  );
};
