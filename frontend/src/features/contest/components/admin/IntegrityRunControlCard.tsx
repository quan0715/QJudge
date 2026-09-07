import { SkeletonText, Tag, Tile } from "@carbon/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ExamIntegrityRun } from "@/core/entities/examIntegrity.entity";
import {
  examIntegrityRepository,
  type ExamIntegrityRepository,
} from "@/infrastructure/api/repositories/examIntegrity.repository";

import styles from "./IntegrityRunControlCard.module.scss";

export interface IntegrityRunControlCardProps {
  contestId: string;
  repository?: Pick<ExamIntegrityRepository, "listRuns">;
}

type Translate = (key: string, fallback: string) => string;

const getPresentation = (run: ExamIntegrityRun | null, unavailable: boolean, t: Translate) => {
  if (unavailable) return {
    label: t("integrityStatus.unavailable", "暫時無法更新監考狀態"),
    description: t("integrityStatus.unavailableDescription", "系統會自動重試，不影響學生作答與交卷。"),
  };
  if (run?.dataState === "purged") return {
    label: t("integrityStatus.purged", "資料已清除"),
    description: t("integrityStatus.purgedDescription", "此場考試的監考資料已永久清除。"),
  };
  if (run?.dataState === "archived") return {
    label: t("integrityStatus.archived", "已封存"),
    description: t("integrityStatus.archivedDescription", "考試紀錄已封存；證據是否完整請以各事件的證據狀態為準。"),
  };
  if (run?.health === "unhealthy") return {
    label: t("integrityStatus.interrupted", "監考暫時中斷"),
    description: t("integrityStatus.interruptedDescription", "監考紀錄可能延遲或缺漏，不影響學生作答與交卷。"),
  };
  if (run?.sessionState === "draining") return {
    label: t("integrityStatus.draining", "整理考試紀錄中"),
    description: t("integrityStatus.drainingDescription", "考試已結束，系統正在整理已收到的事件與證據。"),
  };
  if (run?.sessionState === "active") return {
    label: t("integrityStatus.active", "監考中"),
    description: t("integrityStatus.activeDescription", "系統自動接收考試紀錄；請在事件與證據中進行人工判讀。"),
  };
  if (run?.sessionState === "closed") return {
    label: t("integrityStatus.closed", "監考已結束"),
    description: t("integrityStatus.closedDescription", "此場考試已停止接收監考紀錄。"),
  };
  return {
    label: t("integrityStatus.waiting", "等待考試開始"),
    description: t("integrityStatus.waitingDescription", "系統依考試時間自動管理監考，無需手動啟動。"),
  };
};

export function IntegrityRunControlCard({
  contestId,
  repository = examIntegrityRepository,
}: IntegrityRunControlCardProps) {
  const { t } = useTranslation("contest");
  const [run, setRun] = useState<ExamIntegrityRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    setLoading(true);
    setRun(null);
    setUnavailable(false);
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const runs = await repository.listRuns(contestId);
        if (!cancelled) {
          setRun(runs[0] ?? null);
          setUnavailable(false);
        }
      } catch {
        if (!cancelled) setUnavailable(true);
      } finally {
        inFlight = false;
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
  }, [contestId, repository]);

  if (loading) return <Tile><SkeletonText paragraph lineCount={2} /></Tile>;
  const presentation = getPresentation(run, unavailable, t);

  return (
    <Tile className={styles.card}>
      <div className={styles.status} role="status">
        <Tag type="cool-gray">{presentation.label}</Tag>
      </div>
      <p className={styles.description}>{presentation.description}</p>
    </Tile>
  );
}

export default IntegrityRunControlCard;
