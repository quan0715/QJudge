import { useTranslation } from "react-i18next";
import { InlineLoading } from "@carbon/react";

interface GlobalSaveIndicatorProps {
  status: "idle" | "saving" | "saved" | "error";
}

/**
 * Minimal auto-save status indicator shown at the top of a settings panel.
 */
export const GlobalSaveIndicator = ({ status }: GlobalSaveIndicatorProps) => {
  const { t } = useTranslation("common");

  if (status === "idle") return null;

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 0 0.5rem" }}>
      {status === "saving" && (
        <InlineLoading description={t("message.saving", "儲存中…")} status="active" />
      )}
      {status === "saved" && (
        <InlineLoading description={t("message.saved", "已儲存")} status="finished" />
      )}
      {status === "error" && (
        <InlineLoading description={t("message.saveFailed", "儲存失敗")} status="error" />
      )}
    </div>
  );
};
