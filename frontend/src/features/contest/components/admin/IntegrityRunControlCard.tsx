import { Button, DefinitionTooltip, Modal, SkeletonText, Tag, TextInput, Tile } from "@carbon/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ExamIntegrityRun } from "@/core/entities/examIntegrity.entity";
import {
  examIntegrityRepository,
  type ExamIntegrityRepository,
} from "@/infrastructure/api/repositories/examIntegrity.repository";
import { useToast } from "@/shared/contexts/ToastContext";

import styles from "./IntegrityRunControlCard.module.scss";

type Action = "start" | "stop" | "destroy" | "purge" | null;

export interface IntegrityRunControlCardProps {
  contestId: string;
  contestName: string;
  contestStartAt?: string | null;
  repository?: Pick<ExamIntegrityRepository,
    "listRuns" | "getRun" | "createRun" | "startRun" | "stopRun" | "destroyRun" | "purgeRun">;
}

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" }).format(new Date(value))
  : "—";

const asNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const runStatus = (run: ExamIntegrityRun) => `${run.computeState}/${run.health}/${run.dataState}`;

export function IntegrityRunControlCard({
  contestId,
  contestName,
  contestStartAt,
  repository = examIntegrityRepository,
}: IntegrityRunControlCardProps) {
  const { t } = useTranslation("contest");
  const { showToast } = useToast();
  const [run, setRun] = useState<ExamIntegrityRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [purgeConfirmation, setPurgeConfirmation] = useState("");

  const refresh = useCallback(async () => {
    const runs = await repository.listRuns(contestId);
    setRun(runs[0] ?? null);
  }, [contestId, repository]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const runs = await repository.listRuns(contestId);
        if (!cancelled) setRun(runs[0] ?? null);
      } catch (error) {
        if (!cancelled) showToast({ kind: "error", title: t("integrityRun.loadFailed", "無法讀取 Integrity Run"), subtitle: error instanceof Error ? error.message : undefined });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const poll = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(poll, 5_000);
    document.addEventListener("visibilitychange", poll);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [contestId, repository, showToast, t]);

  const prepWindow = useMemo(() => {
    const start = Date.parse(contestStartAt ?? "");
    if (!Number.isFinite(start)) return "unknown";
    const remaining = start - Date.now();
    return remaining > 60_000 ? "before" : remaining >= 0 ? "prepare" : "after";
  }, [contestStartAt]);

  const execute = async (nextAction: Exclude<Action, null>) => {
    setBusy(true);
    try {
      let next: ExamIntegrityRun;
      if (!run) next = await repository.createRun(contestId);
      else if (nextAction === "start") next = await repository.startRun(contestId, run.id);
      else if (nextAction === "stop") next = await repository.stopRun(contestId, run.id);
      else if (nextAction === "destroy") next = await repository.destroyRun(contestId, run.id);
      else next = await repository.purgeRun(contestId, run.id);
      setRun(next);
      await refresh();
      showToast({ kind: "success", title: t("integrityRun.actionComplete", "Integrity Run 已更新") });
    } catch (error) {
      showToast({ kind: "error", title: t("integrityRun.actionFailed", "Integrity Run 操作失敗"), subtitle: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false); setAction(null); setPurgeConfirmation("");
    }
  };

  if (loading) return <Tile><SkeletonText paragraph lineCount={4} /></Tile>;

  const canStart = run?.computeState === "stopped";
  const canStop = run?.computeState === "running";
  const canDestroy = run?.computeState === "stopped" && run.dataState === "archived";
  const canPurge = run?.computeState === "destroyed" && run.dataState === "archived";
  const requestAction = (nextAction: Action) => setAction(nextAction);

  return <>
    <Tile className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2>{t("integrityRun.title", "Integrity Worker")}</h2>
          <p>{t("integrityRun.description", "考試事件與 incident 證據的手動生命週期控制")}</p>
        </div>
        {run ? <Tag type={run.health === "healthy" ? "green" : "red"}>{runStatus(run)}</Tag> : <Tag type="cool-gray">{t("integrityRun.noRun", "尚未建立 Run")}</Tag>}
      </div>
      {!run ? <Button onClick={() => void execute("start")} disabled={busy}>{t("integrityRun.create", "建立 Run")}</Button> : <>
        <div className={styles.tags}>
          <Tag type="blue">{t("integrityRun.compute", "運算")}: {run.computeState}</Tag>
          <Tag type={run.health === "healthy" ? "green" : "red"}>{t("integrityRun.health", "健康")}: {run.health}</Tag>
          <Tag type="purple">{t("integrityRun.data", "資料")}: {run.dataState}</Tag>
          {run.warnings.map((warning) => <Tag key={warning} type="warm-gray">{warning}</Tag>)}
        </div>
        <p className={styles.prep}>{t("integrityRun.preparation", "啟動建議")}: {prepWindow === "before" ? t("integrityRun.beforeWindow", "尚未進入 T-60 準備時段") : prepWindow === "prepare" ? t("integrityRun.inWindow", "已進入 T-60 準備時段") : t("integrityRun.afterWindow", "考試已接近或進入執行時段")}</p>
        <dl className={styles.metrics}>
          <div><dt>{t("integrityRun.heartbeat", "最後 heartbeat")}</dt><dd>{formatDate(run.lastWorkerHeartbeatAt)}</dd></div>
          <div><dt>{t("integrityRun.received", "已接收 batch")}</dt><dd>{asNumber(run.receivedCounts.batches)}</dd></div>
          <div><dt>{t("integrityRun.archived", "封存世代")}</dt><dd>{run.archiveGeneration}</dd></div>
          <div><dt>{t("integrityRun.version", "版本")}</dt><dd>{run.workerVersion || "—"} / {run.registryVersion || "—"}</dd></div>
        </dl>
        {run.lastError ? <p className={styles.error}>{run.lastError}{run.lastCorrelationId ? ` (${run.lastCorrelationId})` : ""}</p> : null}
        <div className={styles.actions}>
          <Button onClick={() => requestAction("start")} disabled={!canStart || busy}>{t("integrityRun.start", "啟動 Integrity Worker")}</Button>
          <Button kind="secondary" onClick={() => requestAction("stop")} disabled={!canStop || busy}>{t("integrityRun.stop", "停止並封存")}</Button>
          <Button kind="tertiary" onClick={() => requestAction("destroy")} disabled={!canDestroy || busy}>{t("integrityRun.destroy", "銷毀運算資源")}</Button>
          <Button kind="danger--tertiary" onClick={() => requestAction("purge")} disabled={!canPurge || busy}>{t("integrityRun.purge", "清除保留資料")}</Button>
        </div>
        {!canDestroy && run.computeState !== "destroyed" ? <p className={styles.hint}>{t("integrityRun.destroyHint", "需先完成停止與封存，才能銷毀運算資源。")}</p> : null}
      </>}
      <DefinitionTooltip definition={t("integrityRun.tooltip", "停止會封存資料；銷毀只移除運算資源；清除才會永久刪除保留資料。")}>{t("integrityRun.lifecycleHelp", "生命週期說明")}</DefinitionTooltip>
    </Tile>
    <Modal
      open={action !== null}
      danger={action === "purge"}
      modalHeading={action === "purge" ? t("integrityRun.purge", "清除保留資料") : t("integrityRun.confirm", "確認操作")}
      primaryButtonText={busy ? t("action.loading", "處理中...") : action === "start" ? t("integrityRun.confirmStart", "確認啟動") : t("integrityRun.confirmAction", "確認")}
      secondaryButtonText={t("button.cancel", "取消")}
      primaryButtonDisabled={busy || (action === "purge" && purgeConfirmation !== contestName)}
      onRequestClose={() => !busy && setAction(null)}
      onRequestSubmit={() => action && void execute(action)}
    >
      {action === "purge" ? <TextInput id="integrity-run-purge-confirmation" labelText={t("integrityRun.typeContestName", "輸入考試名稱以確認")} value={purgeConfirmation} onChange={(event) => setPurgeConfirmation(event.target.value)} /> : <p>{action === "destroy" ? t("integrityRun.destroyNotice", "只會銷毀運算資源，封存資料仍會保留。") : t("integrityRun.confirmNotice", "此操作會記錄在考試稽核紀錄中。")}</p>}
    </Modal>
  </>;
}

export default IntegrityRunControlCard;
