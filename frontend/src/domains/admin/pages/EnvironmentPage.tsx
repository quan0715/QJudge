/**
 * Environment Management Page
 *
 * Admin-only page for managing database connections, viewing system status,
 * and performing database sync operations.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Grid,
  Column,
  Tile,
  Toggle,
  Button,
  InlineNotification,
  SkeletonText,
  Tag,
  ProgressBar,
} from "@carbon/react";
import {
  Renew,
  CloudUpload,
  Laptop,
  CheckmarkFilled,
  ErrorFilled,
  ArrowRight,
  Time,
} from "@carbon/icons-react";
import { databaseService } from "@/services/databaseService";
import type { DatabaseStatus } from "@/services/databaseService";

// 延遲等級定義
const getLatencyLevel = (
  latency: number | undefined,
  t: (key: string) => string
): {
  label: string;
  color: string;
  status: "active" | "finished" | "error";
} => {
  if (latency === undefined)
    return { label: t("environment.latencyLevel.unknown"), color: "gray", status: "active" };
  if (latency < 50)
    return {
      label: t("environment.latencyLevel.excellent"),
      color: "var(--cds-support-success)",
      status: "finished",
    };
  if (latency < 100)
    return {
      label: t("environment.latencyLevel.good"),
      color: "var(--cds-support-success)",
      status: "finished",
    };
  if (latency < 200)
    return {
      label: t("environment.latencyLevel.normal"),
      color: "var(--cds-support-warning)",
      status: "active",
    };
  if (latency < 500)
    return {
      label: t("environment.latencyLevel.slow"),
      color: "var(--cds-support-warning)",
      status: "active",
    };
  return { label: t("environment.latencyLevel.verySlow"), color: "var(--cds-support-error)", status: "error" };
};

export const EnvironmentPage = () => {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation("common");
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [switchProgress, setSwitchProgress] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleToggle = async (checked: boolean) => {
    const targetDb = checked ? "cloud" : "default";
    const sourceDb = checked ? "default" : "cloud";

    const sourceLabel = sourceDb === "default" ? t("environment.local") : t("environment.cloud");
    const targetLabel = targetDb === "cloud" ? t("environment.cloud") : t("environment.local");
    
    // 確認切換
    const confirmMessage = t("environment.confirmSwitch", { source: sourceLabel, target: targetLabel });
    if (!confirm(confirmMessage)) return;

    try {
      setSwitching(true);
      setError(null);

      // Step 1: 同步資料庫 (includes migrations)
      setSwitchProgress(t("environment.switchProgress"));
      const syncResult = await databaseService.syncDatabase(sourceDb, targetDb);

      // Step 2: 切換資料庫
      setSwitchProgress(t("environment.switching"));
      const result = await databaseService.switchDatabase(targetDb);
      setStatus((prev) => (prev ? { ...prev, current: result.current } : null));

      setSwitchProgress(null);

      // Build success message with migration info
      let message = t("environment.switchSuccess", { target: targetLabel });
      if (syncResult.migrations && syncResult.migrations.includes("Applying")) {
        message = t("environment.switchSuccessWithMigration", { target: targetLabel });
      }
      setSuccessMessage(message);

      setTimeout(() => {
        setSuccessMessage(null);
        // Reload to apply changes
        window.location.reload();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch");
      setSwitchProgress(null);
    } finally {
      setSwitching(false);
    }
  };

  const handleSync = async (source: string, target: string) => {
    const sourceLabel = source === "default" ? t("environment.local") : t("environment.cloud");
    const targetLabel = target === "cloud" ? t("environment.cloud") : t("environment.local");
    
    const confirmMessage = t("environment.confirmSync", { source: sourceLabel, target: targetLabel });
    if (!confirm(confirmMessage)) return;

    try {
      setSyncing(true);
      setError(null);
      const result = await databaseService.syncDatabase(source, target);

      // Build success message with migration info
      let message = result.message;
      if (result.migrations && result.migrations.includes("Applying")) {
        message = t("environment.switchSuccessWithMigration", { target: targetLabel });
      }
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync");
    } finally {
      setSyncing(false);
    }
  };

  const isCloud = status?.current === "cloud";
  const localStatus = status?.status?.default;
  const cloudStatus = status?.status?.cloud;
  const localLatency = getLatencyLevel(localStatus?.latency_ms, t);
  const cloudLatency = getLatencyLevel(cloudStatus?.latency_ms, t);

  return (
    <Grid className="cds--grid--full-width" style={{ padding: "2rem" }}>
      <Column lg={16} md={8} sm={4}>
        <h1 style={{ marginBottom: "0.5rem" }}>{t("environment.title")}</h1>
        <p style={{ color: "var(--cds-text-secondary)", marginBottom: "2rem" }}>
          {t("environment.subtitle")}
        </p>
      </Column>

      {/* Notifications */}
      {error && (
        <Column lg={16} md={8} sm={4} style={{ marginBottom: "1rem" }}>
          <InlineNotification
            kind="error"
            title={tc("message.error")}
            subtitle={error}
            onCloseButtonClick={() => setError(null)}
          />
        </Column>
      )}

      {successMessage && (
        <Column lg={16} md={8} sm={4} style={{ marginBottom: "1rem" }}>
          <InlineNotification
            kind="success"
            title={tc("message.success")}
            subtitle={successMessage}
            onCloseButtonClick={() => setSuccessMessage(null)}
          />
        </Column>
      )}

      {/* Current Database Section */}
      <Column lg={8} md={8} sm={4} style={{ marginBottom: "1rem" }}>
        <Tile style={{ height: "100%" }}>
          <div style={{ marginBottom: "1rem" }}>
            <h4 style={{ marginBottom: "0.5rem" }}>{t("environment.currentDatabase")}</h4>
            {loading ? (
              <SkeletonText />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                {isCloud ? <CloudUpload size={24} /> : <Laptop size={24} />}
                <span style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                  {isCloud ? t("environment.cloudDatabase") : t("environment.localDatabase")}
                </span>
                <Tag type={isCloud ? "blue" : "green"}>
                  {isCloud ? "Supabase" : "Docker"}
                </Tag>
              </div>
            )}
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            <Toggle
              id="db-toggle"
              labelText={t("environment.databaseSwitch")}
              labelA={t("environment.local")}
              labelB={t("environment.cloud")}
              toggled={isCloud}
              onToggle={handleToggle}
              disabled={loading || switching || syncing}
            />
            {switchProgress && (
              <div style={{ marginTop: "0.5rem" }}>
                <ProgressBar
                  label={switchProgress}
                  status="active"
                  size="small"
                />
              </div>
            )}
          </div>
        </Tile>
      </Column>

      {/* Refresh Button */}
      <Column lg={8} md={8} sm={4} style={{ marginBottom: "1rem" }}>
        <Tile style={{ height: "100%" }}>
          <h4 style={{ marginBottom: "1rem" }}>{t("environment.operations")}</h4>
          <Button
            kind="tertiary"
            renderIcon={Renew}
            onClick={fetchStatus}
            disabled={loading}
          >
            {t("environment.refreshStatus")}
          </Button>
        </Tile>
      </Column>

      {/* Connection Latency Cards */}
      <Column lg={16} md={8} sm={4} style={{ marginBottom: "1rem" }}>
        <Tile>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1rem",
            }}
          >
            <Time size={20} />
            <h4>{t("environment.connectionLatency")}</h4>
          </div>

          {loading ? (
            <SkeletonText paragraph lineCount={2} />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1rem",
              }}
            >
              {/* Local Latency */}
              <div
                style={{
                  padding: "1rem",
                  background: "var(--cds-layer-02)",
                  borderRadius: "4px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <Laptop size={16} />
                    <span style={{ fontWeight: 500 }}>{t("environment.localDatabase")}</span>
                  </div>
                  <Tag
                    type={localStatus?.connected ? "green" : "red"}
                    size="sm"
                  >
                    {localLatency.label}
                  </Tag>
                </div>
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 600,
                    color: localLatency.color,
                  }}
                >
                  {localStatus?.latency_ms !== undefined
                    ? `${localStatus.latency_ms} ms`
                    : "N/A"}
                </div>
                <div style={{ marginTop: "0.5rem" }}>
                  <ProgressBar
                    label={t("environment.latency")}
                    value={
                      localStatus?.latency_ms !== undefined
                        ? Math.min(localStatus.latency_ms / 5, 100)
                        : 0
                    }
                    max={100}
                    status={localLatency.status}
                    size="small"
                    hideLabel
                  />
                </div>
              </div>

              {/* Cloud Latency */}
              <div
                style={{
                  padding: "1rem",
                  background: "var(--cds-layer-02)",
                  borderRadius: "4px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <CloudUpload size={16} />
                    <span style={{ fontWeight: 500 }}>{t("environment.cloudDatabase")}</span>
                  </div>
                  <Tag type={cloudStatus?.connected ? "blue" : "red"} size="sm">
                    {cloudLatency.label}
                  </Tag>
                </div>
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 600,
                    color: cloudLatency.color,
                  }}
                >
                  {cloudStatus?.latency_ms !== undefined
                    ? `${cloudStatus.latency_ms} ms`
                    : "N/A"}
                </div>
                <div style={{ marginTop: "0.5rem" }}>
                  <ProgressBar
                    label={t("environment.latency")}
                    value={
                      cloudStatus?.latency_ms !== undefined
                        ? Math.min(cloudStatus.latency_ms / 5, 100)
                        : 0
                    }
                    max={100}
                    status={cloudLatency.status}
                    size="small"
                    hideLabel
                  />
                </div>
              </div>
            </div>
          )}
        </Tile>
      </Column>

      {/* Database Status Cards */}
      <Column lg={8} md={4} sm={4} style={{ marginBottom: "1rem" }}>
        <Tile
          style={{
            height: "100%",
            borderLeft: `4px solid ${
              localStatus?.connected
                ? "var(--cds-support-success)"
                : "var(--cds-support-error)"
            }`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1rem",
            }}
          >
            <Laptop size={20} />
            <h4>{t("environment.localDatabase")}</h4>
            {!isCloud && (
              <Tag type="green" size="sm">
                {t("environment.inUse")}
              </Tag>
            )}
          </div>

          {loading ? (
            <SkeletonText paragraph lineCount={3} />
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                {localStatus?.connected ? (
                  <CheckmarkFilled
                    size={16}
                    style={{ color: "var(--cds-support-success)" }}
                  />
                ) : (
                  <ErrorFilled
                    size={16}
                    style={{ color: "var(--cds-support-error)" }}
                  />
                )}
                <span>{localStatus?.connected ? tc("status.connected") : tc("status.disconnected")}</span>
              </div>
              {localStatus?.host && (
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                    wordBreak: "break-all",
                  }}
                >
                  Host: {localStatus.host}
                </p>
              )}
              {localStatus?.database && (
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  Database: {localStatus.database}
                </p>
              )}
            </>
          )}
        </Tile>
      </Column>

      <Column lg={8} md={4} sm={4} style={{ marginBottom: "1rem" }}>
        <Tile
          style={{
            height: "100%",
            borderLeft: `4px solid ${
              cloudStatus?.connected
                ? "var(--cds-support-success)"
                : "var(--cds-support-error)"
            }`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1rem",
            }}
          >
            <CloudUpload size={20} />
            <h4>{t("environment.cloudDatabase")}</h4>
            {isCloud && (
              <Tag type="blue" size="sm">
                {t("environment.inUse")}
              </Tag>
            )}
          </div>

          {loading ? (
            <SkeletonText paragraph lineCount={3} />
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                {cloudStatus?.connected ? (
                  <CheckmarkFilled
                    size={16}
                    style={{ color: "var(--cds-support-success)" }}
                  />
                ) : (
                  <ErrorFilled
                    size={16}
                    style={{ color: "var(--cds-support-error)" }}
                  />
                )}
                <span>{cloudStatus?.connected ? tc("status.connected") : tc("status.disconnected")}</span>
              </div>
              {cloudStatus?.host && (
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                    wordBreak: "break-all",
                  }}
                >
                  Host: {cloudStatus.host}
                </p>
              )}
              {cloudStatus?.database && (
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  Database: {cloudStatus.database}
                </p>
              )}
            </>
          )}
        </Tile>
      </Column>

      {/* Sync Section */}
      <Column lg={16} md={8} sm={4}>
        <Tile>
          <h4 style={{ marginBottom: "1rem" }}>資料庫同步</h4>
          <p
            style={{
              color: "var(--cds-text-secondary)",
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
            }}
          >
            將資料從一個資料庫同步到另一個。同步前會自動執行目標資料庫的遷移。注意：此操作會覆蓋目標資料庫的資料。
          </p>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <Button
              kind="secondary"
              renderIcon={ArrowRight}
              onClick={() => handleSync("default", "cloud")}
              disabled={
                loading ||
                syncing ||
                switching ||
                !localStatus?.connected ||
                !cloudStatus?.connected
              }
            >
              本地 → 雲端
            </Button>

            <Button
              kind="secondary"
              renderIcon={ArrowRight}
              onClick={() => handleSync("cloud", "default")}
              disabled={
                loading ||
                syncing ||
                switching ||
                !localStatus?.connected ||
                !cloudStatus?.connected
              }
            >
              {t("environment.syncCloudToLocal")}
            </Button>
          </div>

          {syncing && (
            <div style={{ marginTop: "1rem" }}>
              <ProgressBar
                label={t("environment.syncingPleaseWait")}
                status="active"
                size="small"
              />
            </div>
          )}

          {(!localStatus?.connected || !cloudStatus?.connected) && !loading && (
            <InlineNotification
              kind="warning"
              title={t("environment.cannotSync")}
              subtitle={t("environment.needBothConnected")}
              lowContrast
              hideCloseButton
              style={{ marginTop: "1rem" }}
            />
          )}
        </Tile>
      </Column>
    </Grid>
  );
};

export default EnvironmentPage;
