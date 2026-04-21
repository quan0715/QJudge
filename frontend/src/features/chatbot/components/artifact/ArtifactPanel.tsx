import { useMemo } from "react";
import { IconButton, InlineLoading } from "@carbon/react";
import { Close, Download, Renew, Document } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import { useArtifactPanel } from "@/features/chatbot/contexts/ArtifactPanelContext";
import { fetchArtifactDownloadUrl } from "@/infrastructure/api/repositories/artifact.repository";
import { ArtifactPreview } from "./ArtifactPreview";
import styles from "./ArtifactPanel.module.scss";

function formatBytes(n: number): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function ArtifactPanel() {
  const { t } = useTranslation("chatbot");
  const {
    artifacts,
    isLoading,
    error,
    activeArtifactId,
    refresh,
    close,
  } = useArtifactPanel();

  const active = useMemo(
    () => artifacts.find((a) => a.id === activeArtifactId) ?? null,
    [artifacts, activeArtifactId],
  );

  const handleDownload = async () => {
    if (!active) return;
    try {
      const { url } = await fetchArtifactDownloadUrl(active.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Keep panel usable; user can still refresh/retry.
    }
  };

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.title}>
          <Document size={16} className={styles.titleIcon} />
          <span className={styles.titleText}>
            {active ? active.filename : t("artifact.panelTitle", "輸出產物")}
          </span>
          {active && (
            <span className={styles.titleMeta}>
              {active.step} · {formatBytes(active.size_bytes)}
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          <IconButton
            kind="ghost"
            size="sm"
            align="bottom"
            label={t("artifact.download", "下載")}
            onClick={() => void handleDownload()}
            disabled={!active}
          >
            <Download size={16} />
          </IconButton>
          <IconButton
            kind="ghost"
            size="sm"
            align="bottom"
            label={t("artifact.refresh", "重新載入")}
            onClick={() => void refresh()}
          >
            <Renew size={16} />
          </IconButton>
          <IconButton
            kind="ghost"
            size="sm"
            align="bottom"
            label={t("artifact.close", "關閉")}
            onClick={close}
          >
            <Close size={16} />
          </IconButton>
        </div>
      </header>

      <div className={styles.body}>
        {active ? (
          <ArtifactPreview artifact={active} />
        ) : isLoading ? (
          <div className={styles.state}>
            <InlineLoading description={t("artifact.loading", "載入中…")} />
          </div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : (
          <div className={styles.state}>
            {t("artifact.selectFromChat", "請從對話中的產物卡片點擊開啟")}
          </div>
        )}
      </div>
    </div>
  );
}
