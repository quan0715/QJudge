import React, { useCallback } from "react";
import { SettingsSection } from "@/features/auth/components/SettingsSection";
import { useEntitlement } from "@/features/pricing/hooks/useEntitlement";
import { useRecurCheckout } from "@/features/pricing/hooks/useRecurCheckout";
import { useToast } from "@/shared/contexts";
import { getCheckoutConfig } from "@/infrastructure/api/repositories/subscription.repository";
import PricingCard from "@/features/pricing/components/PricingCard";
import "./PlansPanel.scss";

const PRO_FEATURES = [
  { text: "每場考試最多 200 人" },
  { text: "500 AI Credits / 月" },
  { text: "無限題庫儲存" },
  { text: "資料保留 1 年" },
  { text: "10 GB 儲存空間" },
];

const TEAM_FEATURES = [
  { text: "每場考試最多 500 人" },
  { text: "2,000 AI Credits / 月" },
  { text: "無限題庫儲存" },
  { text: "10 位管理者" },
  { text: "50 GB 儲存空間" },
];

export const PlansPanel: React.FC = () => {
  const { tier } = useEntitlement();
  const { sdkReady, loading: checkoutLoading, checkout } = useRecurCheckout();
  const { showToast } = useToast();

  const handleCheckout = useCallback(
    async (slug: "pro" | "team") => {
      try {
        const res = await getCheckoutConfig(slug);
        const { publishable_key, product_id, customer_email } = res.data;
        await checkout(publishable_key, product_id, customer_email);
      } catch {
        showToast({ kind: "error", title: "無法開啟結帳頁面，請稍後再試" });
      }
    },
    [checkout, showToast]
  );

  const proIsRecommended = tier === "free";
  const teamIsRecommended = tier === "pro";

  return (
    <div className="settings-panel">
      <SettingsSection
        title="探索方案"
        description="所有方案皆包含完整功能，差異僅在用量額度"
      >
        <div className="plans-panel__grid">
          <PricingCard
            name="個人方案"
            price="NT$990"
            period="月"
            description="有穩定考試需求的個人用戶"
            features={PRO_FEATURES}
            ctaLabel={checkoutLoading ? "處理中..." : "開始免費試用"}
            onCtaClick={() => handleCheckout("pro")}
            highlighted={proIsRecommended}
            badge={tier === "free" ? "30 天免費" : undefined}
            disabled={checkoutLoading || !sdkReady}
            current={tier === "pro"}
          />
          <PricingCard
            name="團隊方案"
            price="NT$4,500"
            period="月"
            description="學校、科系、培訓機構"
            features={TEAM_FEATURES}
            ctaLabel={checkoutLoading ? "處理中..." : "立即訂閱"}
            onCtaClick={() => handleCheckout("team")}
            highlighted={teamIsRecommended}
            disabled={checkoutLoading || !sdkReady}
            current={tier === "team"}
          />
        </div>

        <p className="plans-panel__enterprise">
          需要更大規模？
          <a href="mailto:support@qjudge.tw">聯繫我們</a>
          取得 Enterprise 客製方案。
        </p>
      </SettingsSection>
    </div>
  );
};

export default PlansPanel;
