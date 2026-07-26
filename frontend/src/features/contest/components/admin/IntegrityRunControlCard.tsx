import { Button, SkeletonText, Tag, Tile } from "@carbon/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ExamIntegrityRun } from "@/core/entities/examIntegrity.entity";
import {
  examIntegrityRepository,
  type ExamIntegrityRepository,
} from "@/infrastructure/api/repositories/examIntegrity.repository";
import { useToast } from "@/shared/contexts/ToastContext";

import styles from "./IntegrityRunControlCard.module.scss";

type Translate = (key: string, fallback: string) => string;
type TagType = "blue" | "cool-gray" | "green" | "purple" | "red";
type RunPresentation = {
  label: string;
  description: string;
  tagType: TagType;
};

export interface IntegrityRunControlCardProps {
  contestId: string;
  repository?: Pick<ExamIntegrityRepository, "listRuns" | "restartRun">;
}

const getRunPresentation = (
  run: ExamIntegrityRun | null,
  t: Translate,
): RunPresentation => {
  if (!run) {
    return {
      label: t("integrityRun.waiting", "等待系統啟動"),
      description: t(
        "integrityRun.waitingDescription",
        "系統會依考試時段自動管理 Worker。",
      ),
      tagType: "cool-gray",
    };
  }

  if (run.computeState === "running" && run.health === "unhealthy") {
    return {
      label: t("integrityRun.workerUnhealthy", "Worker 異常"),
      description: t(
        "integrityRun.workerUnhealthyDescription",
        "目前無法穩定接收考試事件，可嘗試重新啟動。",
      ),
      tagType: "red",
    };
  }

  if (run.computeState === "running") {
    return {
      label: t("integrityRun.healthy", "正常運作"),
      description: t(
        "integrityRun.healthyDescription",
        "Worker 正在接收並處理考試事件。",
      ),
      tagType: "green",
    };
  }

  if (run.computeState === "starting" || run.computeState === "stopping") {
    return {
      label: run.computeState === "starting"
        ? t("integrityRun.starting", "啟動中")
        : t("integrityRun.stopping", "收尾中"),
      description: t("integrityRun.transitionDescription", "系統正在更新 Worker 狀態。"),
      tagType: "blue",
    };
  }

  if (run.dataState === "archived") {
    return {
      label: t("integrityRun.archived", "已封存"),
      description: t("integrityRun.archivedDescription", "考試資料已完成封存。"),
      tagType: "purple",
    };
  }

  if (run.dataState === "purged") {
    return {
      label: t("integrityRun.completed", "已完成"),
      description: t("integrityRun.completedDescription", "此考試的 Worker 生命週期已結束。"),
      tagType: "cool-gray",
    };
  }

  return {
    label: t("integrityRun.ready", "等待考試開始"),
    description: t("integrityRun.readyDescription", "系統會在需要時自動啟動 Worker。"),
    tagType: "cool-gray",
  };
};

export function IntegrityRunControlCard({
  contestId,
  repository = examIntegrityRepository,
}: IntegrityRunControlCardProps) {
  const { t } = useTranslation("contest");
  const { showToast } = useToast();
  const [run, setRun] = useState<ExamIntegrityRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [restartPending, setRestartPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const runs = await repository.listRuns(contestId);
        if (!cancelled) setRun(runs[0] ?? null);
      } catch (error) {
        if (!cancelled) {
          showToast({
            kind: "error",
            title: t("integrityRun.loadFailed", "無法讀取 Worker 狀態"),
            subtitle: error instanceof Error ? error.message : undefined,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const poll = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(poll, 10_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [contestId, repository, showToast, t]);

  const restart = async () => {
    if (!run || run.computeState !== "running" || run.health !== "unhealthy") return;
    setBusy(true);
    try {
      setRun(await repository.restartRun(contestId, run.id));
      showToast({
        kind: "success",
        title: t("integrityRun.restartComplete", "Worker 已重新啟動"),
      });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("integrityRun.restartFailed", "無法重新啟動 Worker"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
      setRestartPending(false);
    }
  };

  if (loading) return <Tile><SkeletonText paragraph lineCount={2} /></Tile>;

  const presentation = getRunPresentation(run, t);
  const canRestart = run?.computeState === "running" && run.health === "unhealthy";

  return (
    <Tile className={styles.card}>
      <div className={styles.status}>
        <Tag type={presentation.tagType}>{presentation.label}</Tag>
      </div>
      <p className={styles.description}>{presentation.description}</p>

      {canRestart && !restartPending ? (
        <Button kind="secondary" disabled={busy} onClick={() => setRestartPending(true)}>
          {t("integrityRun.restart", "重新啟動 Worker")}
        </Button>
      ) : null}

      {canRestart && restartPending ? (
        <div className={styles.restartConfirmation}>
          <p>{t("integrityRun.restartPreservesData", "事件與證據資料會保留。")}</p>
          <div className={styles.confirmationActions}>
            <Button kind="secondary" disabled={busy} onClick={() => setRestartPending(false)}>
              {t("button.cancel", "取消")}
            </Button>
            <Button kind="primary" disabled={busy} onClick={() => void restart()}>
              {t("integrityRun.confirmRestart", "確認重啟")}
            </Button>
          </div>
        </div>
      ) : null}
    </Tile>
  );
}

export default IntegrityRunControlCard;
