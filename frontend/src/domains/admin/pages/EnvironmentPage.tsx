/**
 * Environment Management Page
 *
 * Admin-only page for managing database connections, viewing system status,
 * and performing database sync operations.
 * Only accessible in development mode.
 */

import { useState, useEffect, useCallback } from "react";
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
  latency: number | undefined
): {
  label: string;
  color: string;
  status: "active" | "finished" | "error";
} => {
  if (latency === undefined)
    return { label: "未知", color: "gray", status: "active" };
  if (latency < 50)
    return {
      label: "極佳",
      color: "var(--cds-support-success)",
      status: "finished",
    };
  if (latency < 100)
    return {
      label: "良好",
      color: "var(--cds-support-success)",
      status: "finished",
    };
  if (latency < 200)
    return {
      label: "普通",
      color: "var(--cds-support-warning)",
      status: "active",
    };
  if (latency < 500)
    return {
      label: "較慢",
      color: "var(--cds-support-warning)",
      status: "active",
    };
  return { label: "很慢", color: "var(--cds-support-error)", status: "error" };
};

export const EnvironmentPage = () => {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [switchProgress, setSwitchProgress] = useState<string | null>(null);

  const isDev = import.meta.env.DEV;

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

    // 確認切換
    const confirmMessage = `切換前會將資料從 ${
      sourceDb === "default" ? "本地" : "雲端"
    } 同步到 ${targetDb === "cloud" ? "雲端" : "本地"}。\n\n確定要繼續嗎？`;
    if (!confirm(confirmMessage)) return;

    try {
      setSwitching(true);
      setError(null);

      // Step 1: 同步資料庫
      setSwitchProgress("同步資料庫中...");
      await databaseService.syncDatabase(sourceDb, targetDb);

      // Step 2: 切換資料庫
      setSwitchProgress("切換資料庫中...");
      const result = await databaseService.switchDatabase(targetDb);
      setStatus((prev) => (prev ? { ...prev, current: result.current } : null));

      setSwitchProgress(null);
      setSuccessMessage(
        `已切換至 ${targetDb === "cloud" ? "雲端" : "本地"} 資料庫`
      );
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
    const confirmMessage = `確定要將資料從 ${
      source === "default" ? "本地" : "雲端"
    } 同步到 ${
      target === "cloud" ? "雲端" : "本地"
    } 嗎？\n\n這會覆蓋目標資料庫的資料。`;
    if (!confirm(confirmMessage)) return;

    try {
      setSyncing(true);
      setError(null);
      const result = await databaseService.syncDatabase(source, target);
      setSuccessMessage(result.message);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync");
    } finally {
      setSyncing(false);
    }
  };

  // Show warning if not in dev mode
  if (!isDev) {
    return (
      <Grid className="cds--grid--full-width" style={{ padding: "2rem" }}>
        <Column lg={16} md={8} sm={4}>
          <InlineNotification
            kind="warning"
            title="不可用"
            subtitle="環境管理功能僅在開發模式下可用"
            hideCloseButton
          />
        </Column>
      </Grid>
    );
  }

  const isCloud = status?.current === "cloud";
  const localStatus = status?.status?.default;
  const cloudStatus = status?.status?.cloud;
  const localLatency = getLatencyLevel(localStatus?.latency_ms);
  const cloudLatency = getLatencyLevel(cloudStatus?.latency_ms);

  return (
    <Grid className="cds--grid--full-width" style={{ padding: "2rem" }}>
      <Column lg={16} md={8} sm={4}>
        <h1 style={{ marginBottom: "0.5rem" }}>環境管理</h1>
        <p style={{ color: "var(--cds-text-secondary)", marginBottom: "2rem" }}>
          管理資料庫連接與同步操作（僅開發模式）
        </p>
      </Column>

      {/* Notifications */}
      {error && (
        <Column lg={16} md={8} sm={4} style={{ marginBottom: "1rem" }}>
          <InlineNotification
            kind="error"
            title="錯誤"
            subtitle={error}
            onCloseButtonClick={() => setError(null)}
          />
        </Column>
      )}

      {successMessage && (
        <Column lg={16} md={8} sm={4} style={{ marginBottom: "1rem" }}>
          <InlineNotification
            kind="success"
            title="成功"
            subtitle={successMessage}
            onCloseButtonClick={() => setSuccessMessage(null)}
          />
        </Column>
      )}

      {/* Current Database Section */}
      <Column lg={8} md={8} sm={4} style={{ marginBottom: "1rem" }}>
        <Tile style={{ height: "100%" }}>
          <div style={{ marginBottom: "1rem" }}>
            <h4 style={{ marginBottom: "0.5rem" }}>目前使用的資料庫</h4>
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
                  {isCloud ? "雲端資料庫 (Cloud)" : "本地資料庫 (Local)"}
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
              labelText="資料庫切換（切換前會自動同步）"
              labelA="本地"
              labelB="雲端"
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
          <h4 style={{ marginBottom: "1rem" }}>操作</h4>
          <Button
            kind="tertiary"
            renderIcon={Renew}
            onClick={fetchStatus}
            disabled={loading}
          >
            重新整理狀態
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
            <h4>連線延遲</h4>
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
                    <span style={{ fontWeight: 500 }}>本地資料庫</span>
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
                <ProgressBar
                  value={
                    localStatus?.latency_ms !== undefined
                      ? Math.min(localStatus.latency_ms / 5, 100)
                      : 0
                  }
                  max={100}
                  status={localLatency.status}
                  size="small"
                  hideLabel
                  style={{ marginTop: "0.5rem" }}
                />
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
                    <span style={{ fontWeight: 500 }}>雲端資料庫</span>
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
                <ProgressBar
                  value={
                    cloudStatus?.latency_ms !== undefined
                      ? Math.min(cloudStatus.latency_ms / 5, 100)
                      : 0
                  }
                  max={100}
                  status={cloudLatency.status}
                  size="small"
                  hideLabel
                  style={{ marginTop: "0.5rem" }}
                />
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
            <h4>本地資料庫</h4>
            {!isCloud && (
              <Tag type="green" size="sm">
                使用中
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
                <span>{localStatus?.connected ? "已連線" : "未連線"}</span>
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
            <h4>雲端資料庫</h4>
            {isCloud && (
              <Tag type="blue" size="sm">
                使用中
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
                <span>{cloudStatus?.connected ? "已連線" : "未連線"}</span>
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
            將資料從一個資料庫同步到另一個。注意：此操作會覆蓋目標資料庫的資料。
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
              雲端 → 本地
            </Button>
          </div>

          {syncing && (
            <div style={{ marginTop: "1rem" }}>
              <ProgressBar
                label="同步中，請稍候..."
                status="active"
                size="small"
              />
            </div>
          )}

          {(!localStatus?.connected || !cloudStatus?.connected) && !loading && (
            <InlineNotification
              kind="warning"
              title="無法同步"
              subtitle="需要兩個資料庫都連線才能進行同步"
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
