import React, { useState } from "react";
import {
  Button,
  Tag,
  Tile,
  SkeletonText,
} from "@carbon/react";
import { useCustomer } from "recur-tw";
import { useEntitlement } from "@/features/pricing/hooks/useEntitlement";
import { useToast } from "@/shared/contexts";
import { createPortalSession } from "@/infrastructure/api/repositories/subscription.repository";
import "./SubscriptionPanel.scss";

const TIER_LABELS: Record<string, string> = {
  free: "免費方案",
  pro: "個人方案",
  team: "團隊方案",
  enterprise: "Enterprise",
};

const STATUS_MAP: Record<
  string,
  { text: string; type: "green" | "blue" | "red" | "gray" }
> = {
  active: { text: "啟用中", type: "green" },
  trialing: { text: "試用中", type: "blue" },
  past_due: { text: "付款逾期", type: "red" },
  canceled: { text: "已取消", type: "gray" },
  cancelled: { text: "已取消", type: "gray" },
  expired: { text: "已到期", type: "gray" },
  purchased: { text: "已購買", type: "green" },
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export const SubscriptionPanel: React.FC = () => {
  const { tier, status, isPaid, isTrialing, isLoading } = useEntitlement();
  const { subscription } = useCustomer();
  const { showToast } = useToast();
  const [portalLoading, setPortalLoading] = useState(false);

  const statusInfo = STATUS_MAP[status ?? "active"] ?? STATUS_MAP.active;
  const canManage =
    isPaid && status !== "canceled" && status !== "cancelled" && status !== "expired";

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await createPortalSession();
      window.location.href = res.data.url;
    } catch {
      showToast({ kind: "error", title: "無法開啟訂閱管理頁面，請稍後再試" });
      setPortalLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="subscription-panel">
        <Tile className="subscription-panel__card">
          <SkeletonText heading width="40%" />
          <SkeletonText paragraph lineCount={3} />
        </Tile>
      </div>
    );
  }

  return (
    <div className="subscription-panel">
      <Tile className="subscription-panel__card">
        <div className="subscription-panel__header">
          <h3 className="subscription-panel__plan-name">
            {TIER_LABELS[tier] ?? tier}
          </h3>
          <Tag type={statusInfo.type} size="sm">
            {statusInfo.text}
          </Tag>
        </div>

        <div className="subscription-panel__details">
          {isTrialing && subscription?.currentPeriodEnd && (
            <div className="subscription-panel__row">
              <span className="subscription-panel__label">試用到期日</span>
              <span>{formatDate(subscription.currentPeriodEnd)}</span>
            </div>
          )}
          {!isTrialing && subscription?.currentPeriodEnd && (
            <div className="subscription-panel__row">
              <span className="subscription-panel__label">目前週期結束</span>
              <span>{formatDate(subscription.currentPeriodEnd)}</span>
            </div>
          )}
          {subscription?.product && (
            <div className="subscription-panel__row">
              <span className="subscription-panel__label">方案</span>
              <span>{subscription.product.name}</span>
            </div>
          )}
        </div>

        {canManage && (
          <div className="subscription-panel__actions">
            <Button
              kind="tertiary"
              size="md"
              onClick={handleManageSubscription}
              disabled={portalLoading}
            >
              {portalLoading ? "載入中..." : "管理訂閱"}
            </Button>
          </div>
        )}
      </Tile>
    </div>
  );
};

export default SubscriptionPanel;
