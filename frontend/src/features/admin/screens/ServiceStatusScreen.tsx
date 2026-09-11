import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Renew } from "@carbon/icons-react";
import {
  Button,
  InlineNotification,
  SkeletonText,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
  Tile,
} from "@carbon/react";

import { PageHeader } from "@/shared/layout/PageHeader";
import ContainerCard from "@/shared/layout/ContainerCard";
import { getServiceStatus } from "@/infrastructure/api/repositories/serviceStatus.repository";
import type {
  ServiceComponentStatus,
  ServiceStatusReport,
} from "@/core/entities/serviceStatus.entity";
import styles from "./AdminScreens.module.scss";

const STATUS_TAG: Record<ServiceComponentStatus, "green" | "red" | "gray"> = {
  up: "green",
  down: "red",
  unknown: "gray",
};

const ServiceStatusScreen = () => {
  const { t } = useTranslation("admin");
  const [report, setReport] = useState<ServiceStatusReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await getServiceStatus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const down = report?.components.filter((c) => c.status !== "up") ?? [];
  const integrity = report?.integrity;

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageInner}>
      <PageHeader
        title={t("service.title", "服務狀態")}
        subtitle={t(
          "service.subtitle",
          "平台自身服務的即時探測結果。開啟或按下重新探測時才會探測，不會持續輪詢。",
        )}
        action={
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Renew}
            disabled={loading}
            onClick={() => void load()}
          >
            {t("service.refresh", "重新探測")}
          </Button>
        }
      />

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          title={t("service.loadFailed", "無法讀取服務狀態")}
          subtitle={error}
          hideCloseButton
        />
      ) : null}

      <ContainerCard>
        {loading && !report ? (
          <SkeletonText paragraph lineCount={5} />
        ) : (
          <>
            <div className={styles.statusSummary} data-testid="service-summary">
              <Tag type={down.length === 0 ? "green" : "red"}>
                {down.length === 0
                  ? t("service.allUp", "全部服務正常")
                  : t("service.someDown", "{{count}} 項服務異常", { count: down.length })}
              </Tag>
              {report ? (
                <span className={styles.statLabel}>
                  {t("service.generatedAt", "探測時間")}:{" "}
                  {new Date(report.generatedAt).toLocaleString()}
                </span>
              ) : null}
            </div>

            <StructuredListWrapper isCondensed data-testid="service-components">
              <StructuredListHead>
                <StructuredListRow head>
                  <StructuredListCell head>{t("service.component", "服務")}</StructuredListCell>
                  <StructuredListCell head>{t("service.status", "狀態")}</StructuredListCell>
                  <StructuredListCell head>{t("service.latency", "延遲")}</StructuredListCell>
                  <StructuredListCell head>{t("service.detail", "細節")}</StructuredListCell>
                </StructuredListRow>
              </StructuredListHead>
              <StructuredListBody>
                {report?.components.map((component) => (
                  <StructuredListRow key={component.id} data-testid={`service-${component.id}`}>
                    <StructuredListCell>
                      {t(`service.components.${component.id}`, component.id)}
                    </StructuredListCell>
                    <StructuredListCell>
                      <Tag type={STATUS_TAG[component.status]}>{component.status}</Tag>
                    </StructuredListCell>
                    <StructuredListCell>
                      {component.latencyMs === null ? "—" : `${component.latencyMs} ms`}
                    </StructuredListCell>
                    <StructuredListCell>
                      <code className={styles.probeDetail}>{component.detail}</code>
                    </StructuredListCell>
                  </StructuredListRow>
                ))}
              </StructuredListBody>
            </StructuredListWrapper>
          </>
        )}
      </ContainerCard>

      {integrity ? (
        <ContainerCard>
          <h3 className={styles.statValue}>
            {t("service.integrityTitle", "監考 Run")}
          </h3>
          <div className={styles.statTileRow} data-testid="integrity-metrics">
            <Tile>
              <p className={styles.statLabel}>{t("service.liveRuns", "進行中")}</p>
              <p className={styles.statValue}>{integrity.liveRunCount}</p>
            </Tile>
            <Tile>
              <p className={styles.statLabel}>{t("service.unhealthyRuns", "unhealthy")}</p>
              <p className={styles.statValue}>{integrity.unhealthyRunCount}</p>
            </Tile>
            <Tile>
              <p className={styles.statLabel}>
                {t("service.staleHeartbeats", "心跳逾時")}
              </p>
              <p className={styles.statValue}>{integrity.staleHeartbeatCount}</p>
            </Tile>
            <Tile>
              <p className={styles.statLabel}>
                {t("service.neverReported", "從未回報")}
              </p>
              <p className={styles.statValue}>{integrity.neverReportedCount}</p>
            </Tile>
          </div>
          <p className={styles.statLabel}>
            {t("service.staleHint", "心跳超過 {{seconds}} 秒未更新視為逾時。", {
              seconds: integrity.heartbeatStaleAfterSeconds,
            })}
          </p>

          {integrity.unhealthyRuns.length > 0 ? (
            <StructuredListWrapper isCondensed data-testid="unhealthy-runs">
              <StructuredListHead>
                <StructuredListRow head>
                  <StructuredListCell head>{t("service.contest", "競賽")}</StructuredListCell>
                  <StructuredListCell head>{t("service.runState", "狀態")}</StructuredListCell>
                  <StructuredListCell head>{t("service.worker", "Worker")}</StructuredListCell>
                  <StructuredListCell head>{t("service.lastError", "最後錯誤")}</StructuredListCell>
                </StructuredListRow>
              </StructuredListHead>
              <StructuredListBody>
                {integrity.unhealthyRuns.map((run) => (
                  <StructuredListRow key={run.id}>
                    <StructuredListCell>
                      <code className={styles.probeDetail}>{run.contestId}</code>
                    </StructuredListCell>
                    <StructuredListCell>
                      {run.sessionState} / {run.dataState}
                    </StructuredListCell>
                    <StructuredListCell>
                      <span>{run.workerVersion || "—"}</span>
                      <br />
                      <span className={styles.probeDetail}>
                        {run.lastWorkerHeartbeatAt
                          ? new Date(run.lastWorkerHeartbeatAt).toLocaleString()
                          : t("service.noHeartbeat", "無心跳")}
                      </span>
                    </StructuredListCell>
                    <StructuredListCell>
                      <code className={styles.probeDetail}>{run.lastError || "—"}</code>
                    </StructuredListCell>
                  </StructuredListRow>
                ))}
              </StructuredListBody>
            </StructuredListWrapper>
          ) : null}
        </ContainerCard>
      ) : null}
      </div>
    </div>
  );
};

export default ServiceStatusScreen;
