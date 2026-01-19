/**
 * DatabaseSwitcher Component
 *
 * A compact toggle for switching between local and cloud databases.
 * Only visible in development mode for admin users.
 */

import { useState, useEffect, useCallback } from "react";
import { Toggle, InlineNotification, InlineLoading } from "@carbon/react";
import { CloudUpload, Laptop } from "@carbon/icons-react";
import { databaseService } from "@/infrastructure/api/repositories/database.repository";
import type { DatabaseStatus } from "@/infrastructure/api/repositories/database.repository";

interface DatabaseSwitcherProps {
  isAdmin: boolean;
}

export const DatabaseSwitcher = ({ isAdmin }: DatabaseSwitcherProps) => {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check if we're in development mode
  const isDev = import.meta.env.DEV;

  const fetchStatus = useCallback(async () => {
    if (!isDev || !isAdmin) return;

    try {
      setLoading(true);
      setError(null);
      const data = await databaseService.getStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }, [isDev, isAdmin]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleToggle = async (checked: boolean) => {
    const targetDb = checked ? "cloud" : "default";
    const sourceDb = checked ? "default" : "cloud";

    try {
      setSwitching(true);
      setError(null);

      // 切換前先同步資料庫
      setSuccessMessage("同步資料庫中...");
      await databaseService.syncDatabase(sourceDb, targetDb);

      // 同步完成後切換
      setSuccessMessage("切換資料庫中...");
      const result = await databaseService.switchDatabase(targetDb);
      setStatus((prev) => (prev ? { ...prev, current: result.current } : null));
      setSuccessMessage(
        `已切換至 ${targetDb === "cloud" ? "雲端" : "本地"} 資料庫`
      );
      setTimeout(() => {
        setSuccessMessage(null);
        // Reload page to reflect changes
        window.location.reload();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch");
      setSuccessMessage(null);
    } finally {
      setSwitching(false);
    }
  };

  // Don't render if not in dev mode or not admin
  if (!isDev || !isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div style={{ padding: "0.5rem 1rem" }}>
        <InlineLoading description="載入中..." />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div style={{ padding: "0.5rem" }}>
        <InlineNotification
          kind="error"
          title="DB Error"
          subtitle={error}
          lowContrast
          hideCloseButton
        />
      </div>
    );
  }

  const isCloud = status?.current === "cloud";
  const currentDbStatus = status?.status?.[status.current];

  return (
    <div
      style={{
        padding: "0.75rem 1rem",
        borderBottom: "1px solid var(--cds-border-subtle)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.5rem",
        }}
      >
        {isCloud ? <CloudUpload size={16} /> : <Laptop size={16} />}
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "var(--cds-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.32px",
          }}
        >
          Database
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <Toggle
          id="db-toggle"
          size="sm"
          labelA="Local"
          labelB="Cloud"
          toggled={isCloud}
          onToggle={handleToggle}
          disabled={switching}
        />
      </div>

      {/* Connection status indicator */}
      <div
        style={{
          marginTop: "0.5rem",
          fontSize: "0.75rem",
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: currentDbStatus?.connected
              ? "var(--cds-support-success)"
              : "var(--cds-support-error)",
          }}
        />
        <span style={{ color: "var(--cds-text-secondary)" }}>
          {currentDbStatus?.connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {switching && (
        <div style={{ marginTop: "0.5rem" }}>
          <InlineLoading description={successMessage || "處理中..."} />
        </div>
      )}

      {error && (
        <div style={{ marginTop: "0.5rem" }}>
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={error}
            lowContrast
            hideCloseButton
          />
        </div>
      )}

      {successMessage && !switching && (
        <div style={{ marginTop: "0.5rem" }}>
          <InlineNotification
            kind="success"
            title="Success"
            subtitle={successMessage}
            lowContrast
            hideCloseButton
          />
        </div>
      )}
    </div>
  );
};
