import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Renew } from "@carbon/icons-react";
import { Button, InlineNotification, SkeletonText, Tile } from "@carbon/react";

import { PageHeader } from "@/shared/layout/PageHeader";
import ContainerCard from "@/shared/layout/ContainerCard";
import { checkSystemUpdates } from "@/infrastructure/api/repositories/system.repository";
import {
  shortVersion,
  type ReleaseCheck,
  type UpgradeJob,
} from "@/core/entities/systemVersion.entity";
import AgentStateNote from "../components/AgentStateNote";
import UpgradeConfirmModal from "../components/UpgradeConfirmModal";
import UpgradeProgress from "../components/UpgradeProgress";
import { UPGRADE_STEP_LABELS } from "../domain/upgradeSteps";
import { useUpgradeJob } from "../hooks/useUpgradeJob";
import styles from "./AdminScreens.module.scss";

const messageOf = (caught: unknown) => (caught instanceof Error ? caught.message : String(caught));

const formatTime = (iso: string) => new Date(iso).toLocaleString();

/** Ask the host which release is newest. Only the newest answer is kept. */
const useReleaseCheck = () => {
  const [release, setRelease] = useState<ReleaseCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  const check = useCallback(async (): Promise<ReleaseCheck | null> => {
    requestRef.current += 1;
    const request = requestRef.current;
    setChecking(true);
    setError("");
    try {
      const next = await checkSystemUpdates();
      if (request !== requestRef.current) return null;
      setRelease(next);
      return next;
    } catch (caught) {
      if (request === requestRef.current) {
        // Without an answer there is no release to offer, so do not keep an old one.
        setRelease(null);
        setError(messageOf(caught));
      }
      return null;
    } finally {
      if (request === requestRef.current) setChecking(false);
    }
  }, []);

  return { release, checking, error, check };
};

interface VersionPanelProps {
  label: string;
  version: ReactNode;
  meta?: string | null;
  muted?: boolean;
}

const VersionPanel = ({ label, version, meta, muted = false }: VersionPanelProps) => (
  <Tile className={styles.versionPanel}>
    <p className={styles.statLabel}>{label}</p>
    <p className={muted ? styles.versionUnknown : styles.versionSha}>{version}</p>
    {meta ? <p className={styles.tileMeta}>{meta}</p> : null}
  </Tile>
);

const SystemVersionScreen = () => {
  const { t } = useTranslation("admin");
  const { phase, state, error, refresh, start } = useUpgradeJob();
  const { release, checking, error: checkError, check } = useReleaseCheck();

  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startError, setStartError] = useState("");
  const [staleNotice, setStaleNotice] = useState(false);
  const [upToDate, setUpToDate] = useState(false);

  // Look for a newer release when the page settles with nothing running, and again when an
  // update has just finished or another one has released the lock.
  const canCheck = phase === "idle" || phase === "succeeded";
  const canRetry = phase === "failed" || phase === "interrupted";
  useEffect(() => {
    if (canCheck) void check();
  }, [canCheck, check]);

  const job: UpgradeJob | null = state?.job ?? null;
  const currentSha = state?.version?.current ?? null;
  const deployedAt = state?.version?.deployedAt ?? null;

  const recheck = async () => {
    setStaleNotice(false);
    await check();
  };

  const openConfirm = (sha: string) => {
    setStartError("");
    setStaleNotice(false);
    setConfirmTarget(sha);
  };

  // Failed and interrupted jobs leave no target to reuse, so look again before asking to confirm.
  const retry = async () => {
    setStaleNotice(false);
    setUpToDate(false);
    const next = await check();
    if (!next) return;
    if (next.updateAvailable) openConfirm(next.latest.sha);
    else setUpToDate(true);
  };

  const confirm = async () => {
    if (confirmTarget === null || submitting) return;
    setSubmitting(true);
    setStartError("");
    try {
      const result = await start(confirmTarget);
      if (result.kind === "notLatest") {
        setConfirmTarget(null);
        await check();
        setStaleNotice(true);
      } else {
        // Started, or someone else holds the lock and the page now shows their job.
        setConfirmTarget(null);
      }
    } catch (caught) {
      setStartError(messageOf(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const currentPanel = (
    <VersionPanel
      label={t("system.version.current", "目前版本")}
      version={
        currentSha ? shortVersion(currentSha) : t("system.overview.version.unknown", "尚無版本紀錄")
      }
      muted={!currentSha}
      meta={
        deployedAt
          ? t("system.version.deployedAt", "部署於 {{time}}", { time: formatTime(deployedAt) })
          : null
      }
    />
  );

  const retryButton = (
    <Button kind="primary" renderIcon={Renew} disabled={checking} onClick={() => void retry()}>
      {t("system.version.retry", "再試一次")}
    </Button>
  );

  const renderIdle = () => (
    <ContainerCard>
      <div className={styles.versionStack}>
        <div className={styles.versionCompare}>
          {currentPanel}
          {release ? (
            <VersionPanel
              label={t("system.version.latest", "main 最新版")}
              version={shortVersion(release.latest.sha)}
              meta={t("system.version.committedAt", "提交於 {{time}}", {
                time: formatTime(release.latest.committedAt),
              })}
            />
          ) : null}
          {!release && checking ? (
            <Tile className={styles.versionPanel}>
              <p className={styles.statLabel}>{t("system.version.latest", "main 最新版")}</p>
              <SkeletonText />
            </Tile>
          ) : null}
        </div>

        {release?.updateAvailable && release.releases.length > 0 ? (
          <div className={styles.releases}>
            <h3 className={styles.releasesTitle}>{t("system.version.contains", "這次更新包含")}</h3>
            <ul className={styles.releaseList}>
              {release.releases.map((item) => (
                <li key={item.sha}>{item.subject}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {release ? (
          <div className={styles.versionActions}>
            <Button
              kind="primary"
              disabled={!release.updateAvailable}
              onClick={() => openConfirm(release.latest.sha)}
            >
              {release.updateAvailable
                ? t("system.version.updateTo", "更新到 {{version}}", {
                    version: shortVersion(release.latest.sha),
                  })
                : t("system.version.upToDate", "已是最新版本")}
            </Button>
          </div>
        ) : null}
      </div>
    </ContainerCard>
  );

  const renderBody = () => {
    switch (phase) {
      case "loading":
        return (
          <ContainerCard>
            <SkeletonText paragraph lineCount={4} />
          </ContainerCard>
        );
      case "unsupported":
      case "unreachable":
        return state ? (
          <ContainerCard>
            <div className={styles.versionStack}>
              <AgentStateNote
                agent={phase}
                unsupported={t("system.version.unsupported", "此環境不支援線上更新")}
              />
              {currentSha ? currentPanel : null}
            </div>
          </ContainerCard>
        ) : null;
      case "running":
      case "switching":
        return job ? (
          <ContainerCard>
            <UpgradeProgress job={job} log={state?.log ?? ""} switching={phase === "switching"} />
          </ContainerCard>
        ) : null;
      case "failed":
      case "interrupted":
        return job ? (
          <ContainerCard>
            <div className={styles.versionStack}>
              <UpgradeProgress job={job} log={state?.log ?? ""} />
              <div className={styles.versionActions}>{retryButton}</div>
            </div>
          </ContainerCard>
        ) : null;
      case "external":
        return (
          <ContainerCard>
            <div className={styles.versionStack}>
              {currentPanel}
              <div className={styles.versionActions}>
                <Button kind="primary" disabled>
                  {t("system.version.update", "更新")}
                </Button>
              </div>
            </div>
          </ContainerCard>
        );
      default:
        return renderIdle();
    }
  };

  const renderPhaseNotice = () => {
    switch (phase) {
      case "succeeded":
        return job ? (
          <InlineNotification
            kind="success"
            lowContrast
            hideCloseButton
            title={t("system.version.succeeded", "已更新到 {{version}}", {
              version: shortVersion(job.target),
            })}
          />
        ) : null;
      case "failed":
        return (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={
              job?.siteHealthy === true
                ? currentSha
                  ? t("system.version.failed.healthy", "更新失敗，網站維持在 {{version}} 正常運作。", {
                      version: shortVersion(currentSha),
                    })
                  : t("system.version.failed.healthyUnknown", "更新失敗，網站維持在目前版本正常運作。")
                : t("system.version.failed.unhealthy", "更新失敗，網站可能異常，請把紀錄交給維護者。")
            }
            subtitle={
              job?.step
                ? t("system.version.failed.step", "失敗的步驟：{{step}}", {
                    step: t(`system.version.progress.steps.${job.step}`, UPGRADE_STEP_LABELS[job.step]),
                  })
                : undefined
            }
          />
        );
      case "interrupted":
        return (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title={t(
              "system.version.interrupted",
              "上次更新在進行中被中斷，網站狀態以目前版本為準。",
            )}
          />
        );
      case "external":
        return (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title={t("system.version.external", "另一個更新正在進行（由終端機或 CD 觸發）")}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageInner}>
        <PageHeader
          title={t("system.version.title", "系統版本")}
          subtitle={t("system.version.subtitle", "目前部署的版本，以及可以更新到的 main 最新版。")}
          action={
            canCheck ? (
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Renew}
                disabled={checking}
                onClick={() => void recheck()}
              >
                {t("system.version.recheck", "重新檢查")}
              </Button>
            ) : null
          }
        />

        <div className={styles.versionNotices}>
          {error ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={t("system.version.loadFailed", "無法讀取系統版本")}
              subtitle={error}
            />
          ) : null}
          {renderPhaseNotice()}
          {staleNotice && (canCheck || canRetry) ? (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title={t("system.version.notLatest", "main 已有更新的版本，請確認後再更新")}
            />
          ) : null}
          {checkError && (canCheck || canRetry) ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={t("system.version.checkFailed", "無法檢查新版")}
              subtitle={checkError}
            />
          ) : null}
          {upToDate && !checkError && canRetry ? (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title={t("system.version.upToDate", "已是最新版本")}
            />
          ) : null}
        </div>

        {renderBody()}

        {phase === "unreachable" ? (
          <div className={styles.versionActions}>
            <Button kind="tertiary" renderIcon={Renew} onClick={() => void refresh()}>
              {t("system.version.reconnect", "重新連線")}
            </Button>
          </div>
        ) : null}
      </div>

      {confirmTarget !== null ? (
        <UpgradeConfirmModal
          target={confirmTarget}
          submitting={submitting}
          error={startError}
          onConfirm={() => void confirm()}
          onCancel={() => setConfirmTarget(null)}
        />
      ) : null}
    </div>
  );
};

export default SystemVersionScreen;
