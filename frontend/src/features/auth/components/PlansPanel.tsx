import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Section } from "@/shared/layout/SettingsPanel";
import { useEntitlement } from "@/features/pricing/hooks/useEntitlement";
import { useRecurCheckout } from "@/features/pricing/hooks/useRecurCheckout";
import { useToast } from "@/shared/contexts";
import { getCheckoutConfig } from "@/infrastructure/api/repositories/subscription.repository";
import PricingCard from "@/features/pricing/components/PricingCard";
import "./PlansPanel.scss";

export const PlansPanel: React.FC = () => {
  const { t } = useTranslation();
  const { tier } = useEntitlement();
  const { sdkReady, loading: checkoutLoading, checkout } = useRecurCheckout();
  const { showToast } = useToast();

  const proFeatures = useMemo(() => {
    const list = t("settings.plans.features.pro", { returnObjects: true });
    return Array.isArray(list) ? list.map(text => ({ text })) : [];
  }, [t]);

  const teamFeatures = useMemo(() => {
    const list = t("settings.plans.features.team", { returnObjects: true });
    return Array.isArray(list) ? list.map(text => ({ text })) : [];
  }, [t]);

  const handleCheckout = useCallback(
    async (slug: "pro" | "team") => {
      try {
        const res = await getCheckoutConfig(slug);
        const { publishable_key, product_id, customer_email } = res.data;
        await checkout(publishable_key, product_id, customer_email);
      } catch {
        showToast({ kind: "error", title: t("settings.plans.openCheckoutFailed", "無法開啟結帳頁面，請稍後再試") });
      }
    },
    [checkout, showToast, t]
  );

  const proIsRecommended = tier === "free";
  const teamIsRecommended = tier === "pro";

  return (
    <>
      <Section
        title={t("settings.plans.title", "探索方案")}
        description={t("settings.plans.description", "所有方案皆包含完整功能，差異僅在用量額度")}
      >
        <div className="plans-panel__grid">
          <PricingCard
            name={t("settings.subscription.tier.pro", "個人方案")}
            price="NT$990"
            period={t("settings.plans.month", "月")}
            description={t("settings.subscription.desc.pro", "有穩定考試需求的個人用戶")}
            features={proFeatures}
            ctaLabel={checkoutLoading ? t("settings.plans.processing", "處理中...") : t("settings.plans.startingTrial", "開始免費試用")}
            onCtaClick={() => handleCheckout("pro")}
            highlighted={proIsRecommended}
            badge={tier === "free" ? t("settings.plans.freeTrial", "30 天免費") : undefined}
            disabled={checkoutLoading || !sdkReady}
            current={tier === "pro"}
          />
          <PricingCard
            name={t("settings.subscription.tier.team", "團隊方案")}
            price="NT$4,500"
            period={t("settings.plans.month", "月")}
            description={t("settings.subscription.desc.team", "學校、科系、培訓機構")}
            features={teamFeatures}
            ctaLabel={checkoutLoading ? t("settings.plans.processing", "處理中...") : t("settings.plans.subscribeNow", "立即訂閱")}
            onCtaClick={() => handleCheckout("team")}
            highlighted={teamIsRecommended}
            disabled={checkoutLoading || !sdkReady}
            current={tier === "team"}
          />
        </div>

        <p className="plans-panel__enterprise">
          {t("settings.plans.enterpriseTitle", "需要更大規模？")}
          <a href="mailto:support@qjudge.tw">{t("settings.plans.contactUs", "聯繫我們")}</a>
          {t("settings.plans.enterpriseCustom", "取得 Enterprise 客製方案。")}
        </p>
      </Section>
    </>
  );
};

export default PlansPanel;
