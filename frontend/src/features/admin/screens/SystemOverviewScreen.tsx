import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClickableTile, SkeletonText, Tag } from "@carbon/react";

import { PageHeader } from "@/shared/layout/PageHeader";
import { getServiceStatus } from "@/infrastructure/api/repositories/serviceStatus.repository";
import { searchUsers } from "@/infrastructure/api/repositories/user.repository";
import {
  checkSystemUpdates,
  getIngress,
  getSystemVersion,
} from "@/infrastructure/api/repositories/system.repository";
import { summarizeServices } from "@/core/entities/serviceStatus.entity";
import { shortVersion, type AgentState } from "@/core/entities/systemVersion.entity";
import { summarizeUsers } from "../domain/userSummary";
import { useAsyncSource, type AsyncSource } from "../hooks/useAsyncSource";
import styles from "./AdminScreens.module.scss";

const loadUserSummary = async () => {
  const response = await searchUsers("");
  if (!response.data) throw new Error("Failed to load users");
  return summarizeUsers(response.data);
};

interface OverviewTileProps {
  id: string;
  title: string;
  to: string;
  children: ReactNode;
}

const OverviewTile = ({ id, title, to, children }: OverviewTileProps) => {
  const navigate = useNavigate();

  return (
    <ClickableTile
      href={to}
      className={styles.overviewTile}
      data-testid={`overview-${id}`}
      onClick={(event) => {
        // Leave modified clicks to the browser so "open in new tab" keeps working.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if ("button" in event && event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      <h2 className={styles.tileTitle}>{title}</h2>
      {children}
    </ClickableTile>
  );
};

interface SourceBodyProps<T> {
  source: AsyncSource<T>;
  children: (data: T) => ReactNode;
}

const SourceBody = <T,>({ source, children }: SourceBodyProps<T>) => {
  const { t } = useTranslation("admin");

  if (source.status === "loading") return <SkeletonText />;
  if (source.status === "failed") {
    return <p className={styles.tileError}>{t("system.overview.loadFailed", "無法讀取")}</p>;
  }
  return <>{children(source.data)}</>;
};

const AgentNote = ({ agent }: { agent: Exclude<AgentState, "ok"> }) => {
  const { t } = useTranslation("admin");

  return (
    <p className={styles.tileMeta}>
      {agent === "unsupported"
        ? t("system.overview.agent.unsupported", "此環境沒有主機 agent")
        : t("system.overview.agent.unreachable", "無法連線到主機 agent")}
    </p>
  );
};

const SystemOverviewScreen = () => {
  const { t } = useTranslation("admin");
  const services = useAsyncSource(getServiceStatus);
  const users = useAsyncSource(loadUserSummary);
  const ingress = useAsyncSource(getIngress);
  const version = useAsyncSource(getSystemVersion);
  // Asking the host for the newest release only makes sense when an agent answered.
  const agentReady = version.status === "ready" && version.data.agent === "ok";
  const releases = useAsyncSource(checkSystemUpdates, agentReady);

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageInner}>
        <PageHeader
          title={t("system.overview.title", "系統概覽")}
          subtitle={t("system.overview.subtitle", "平台目前的服務、使用者與版本摘要，點選卡片查看詳細。")}
        />

        <div className={styles.overviewGrid}>
          <OverviewTile
            id="services"
            title={t("system.overview.services.title", "服務")}
            to="/system/service-status"
          >
            <SourceBody source={services}>
              {(report) => {
                const { total, failed: down } = summarizeServices(report);
                return (
                  <>
                    <div className={styles.tileRow}>
                      <Tag type={down === 0 ? "green" : "red"}>
                        {down === 0
                          ? t("service.allUp", "全部服務正常")
                          : t("service.someDown", "{{count}} 項服務異常", { count: down })}
                      </Tag>
                    </div>
                    <p className={styles.tileMeta}>
                      {t("system.overview.services.up", "{{up}} / {{total}} 項正常", {
                        up: total - down,
                        total,
                      })}
                    </p>
                  </>
                );
              }}
            </SourceBody>
          </OverviewTile>

          <OverviewTile
            id="integrity"
            title={t("system.overview.integrity.title", "監考 Run")}
            to="/system/service-status"
          >
            <SourceBody source={services}>
              {({ integrity }) => {
                const problems =
                  integrity.unhealthyRunCount +
                  integrity.staleHeartbeatCount +
                  integrity.neverReportedCount;
                return (
                  <>
                    <div className={styles.tileRow}>
                      <Tag type={problems === 0 ? "green" : "red"}>
                        {problems === 0
                          ? t("system.overview.integrity.allHealthy", "全部正常")
                          : t("system.overview.integrity.problems", "{{count}} 項異常", {
                              count: problems,
                            })}
                      </Tag>
                    </div>
                    <p className={styles.tileMeta}>
                      {t("system.overview.integrity.live", "{{count}} 個進行中", {
                        count: integrity.liveRunCount,
                      })}
                    </p>
                  </>
                );
              }}
            </SourceBody>
          </OverviewTile>

          <OverviewTile
            id="users"
            title={t("system.overview.users.title", "使用者")}
            to="/system/users"
          >
            <SourceBody source={users}>
              {(summary) => (
                <>
                  <p className={styles.tileValue}>
                    {t("system.overview.users.total", "{{count}} 位使用者", { count: summary.total })}
                  </p>
                  <p className={styles.tileMeta}>
                    {t("system.overview.users.teachers", "{{count}} 位教師", {
                      count: summary.teachers,
                    })}
                  </p>
                  <p className={styles.tileMeta}>
                    {t("system.overview.users.pending", "{{count}} 位未完成 onboarding", {
                      count: summary.pendingOnboarding,
                    })}
                  </p>
                </>
              )}
            </SourceBody>
          </OverviewTile>

          <OverviewTile
            id="ingress"
            title={t("system.overview.ingress.title", "Ingress")}
            to="/system/ingress"
          >
            <SourceBody source={ingress}>
              {(report) => {
                if (report.agent !== "ok") return <AgentNote agent={report.agent} />;
                const total = report.entries.length;
                const ok = report.entries.filter((entry) => entry.ok).length;
                return (
                  <div className={styles.tileRow}>
                    <Tag type={ok === total ? "green" : "red"}>
                      {t("system.overview.ingress.summary", "{{ok}} / {{total}} 個入口正常", {
                        ok,
                        total,
                      })}
                    </Tag>
                  </div>
                );
              }}
            </SourceBody>
          </OverviewTile>

          <OverviewTile
            id="version"
            title={t("system.overview.version.title", "系統版本")}
            to="/system/version"
          >
            <SourceBody source={version}>
              {(state) => {
                if (state.agent !== "ok") return <AgentNote agent={state.agent} />;
                const current = state.version?.current;
                const updateAvailable =
                  releases.status === "ready" && releases.data.updateAvailable;
                return (
                  <div className={styles.tileRow}>
                    {current ? (
                      <code className={styles.tileValue}>{shortVersion(current)}</code>
                    ) : (
                      <p className={styles.tileMeta}>
                        {t("system.overview.version.unknown", "尚無版本紀錄")}
                      </p>
                    )}
                    {updateAvailable ? (
                      <Tag type="blue">{t("system.overview.version.updateAvailable", "有新版")}</Tag>
                    ) : null}
                  </div>
                );
              }}
            </SourceBody>
          </OverviewTile>
        </div>
      </div>
    </div>
  );
};

export default SystemOverviewScreen;
