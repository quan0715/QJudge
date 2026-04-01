import { useNavigate } from "react-router-dom";
import { Button, Tag, Tile, SkeletonText } from "@carbon/react";
import { useSubscription } from "../hooks/useSubscription";
import styles from "./BillingScreen.module.scss";

const TIER_LABELS: Record<string, string> = {
  free: "免費方案",
  pro: "Pro",
  team: "Team",
  enterprise: "Enterprise",
};

const STATUS_LABELS: Record<string, { text: string; type: "green" | "blue" | "red" | "gray" }> = {
  active: { text: "啟用中", type: "green" },
  trialing: { text: "試用中", type: "blue" },
  past_due: { text: "付款逾期", type: "red" },
  cancelled: { text: "已取消", type: "gray" },
  expired: { text: "已到期", type: "gray" },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BillingScreen() {
  const navigate = useNavigate();
  const { data: subscription, isLoading } = useSubscription();

  if (isLoading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>訂閱管理</h1>
        <Tile className={styles.card}>
          <SkeletonText heading width="40%" />
          <SkeletonText paragraph lineCount={3} />
        </Tile>
      </div>
    );
  }

  const tier = subscription?.tier ?? "free";
  const status = subscription?.status ?? "active";
  const statusInfo = STATUS_LABELS[status] ?? STATUS_LABELS.active;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>訂閱管理</h1>

      <Tile className={styles.card}>
        <div className={styles.planHeader}>
          <h2 className={styles.planName}>{TIER_LABELS[tier] ?? tier}</h2>
          <Tag type={statusInfo.type}>{statusInfo.text}</Tag>
        </div>

        <div className={styles.details}>
          {subscription?.trial_end && status === "trialing" && (
            <div className={styles.row}>
              <span className={styles.label}>試用到期日</span>
              <span>{formatDate(subscription.trial_end)}</span>
            </div>
          )}
          {subscription?.current_period_end && (
            <div className={styles.row}>
              <span className={styles.label}>目前週期結束</span>
              <span>{formatDate(subscription.current_period_end)}</span>
            </div>
          )}
          {subscription?.cancelled_at && (
            <div className={styles.row}>
              <span className={styles.label}>取消日期</span>
              <span>{formatDate(subscription.cancelled_at)}</span>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          {tier === "free" && (
            <Button kind="primary" onClick={() => navigate("/pricing")}>
              升級方案
            </Button>
          )}
          {tier !== "free" && status !== "cancelled" && status !== "expired" && (
            <p className={styles.cancelNote}>
              如需取消訂閱或變更方案，請聯繫{" "}
              <a href="mailto:support@qjudge.tw">support@qjudge.tw</a>
            </p>
          )}
        </div>
      </Tile>
    </div>
  );
}
