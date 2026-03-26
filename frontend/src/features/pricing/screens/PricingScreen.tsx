import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Grid, Column, Theme } from "@carbon/react";
import { useSubscribe } from "recur-tw";
import { useAuth } from "@/features/auth";
import { useEntitlement } from "../hooks/useEntitlement";
import { getCheckoutConfig } from "@/infrastructure/api/repositories/subscription.repository";
import PricingCard from "../components/PricingCard";
import styles from "./PricingScreen.module.scss";

const FREE_FEATURES = [
  { text: "所有平台功能" },
  { text: "每場考試最多 50 人" },
  { text: "200 AI Credits / 月" },
  { text: "100 題題庫儲存" },
  { text: "1 位管理者" },
];

const PRO_FEATURES = [
  { text: "所有平台功能" },
  { text: "每場考試最多 200 人" },
  { text: "500 AI Credits / 月" },
  { text: "無限題庫儲存" },
  { text: "1 位管理者" },
  { text: "資料保留 1 年" },
  { text: "10 GB 儲存空間" },
];

const TEAM_FEATURES = [
  { text: "所有平台功能" },
  { text: "每場考試最多 500 人" },
  { text: "2,000 AI Credits / 月" },
  { text: "無限題庫儲存" },
  { text: "10 位管理者" },
  { text: "資料保留 3 年" },
  { text: "50 GB 儲存空間" },
];

export default function PricingScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { subscribe, isLoading } = useSubscribe();
  const { tier, isPaid } = useEntitlement();

  const handleCheckout = useCallback(
    async (slug: "pro" | "team") => {
      if (!user) {
        navigate(`/login?redirect=/pricing&plan=${slug}`);
        return;
      }
      try {
        const res = await getCheckoutConfig(slug);
        const { product_id, customer_email } = res.data;
        await subscribe({
          productId: product_id,
          customerEmail: customer_email,
          successUrl: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/pricing`,
        });
      } catch {
        // error handled by SDK
      }
    },
    [user, navigate, subscribe]
  );

  // Auto-trigger checkout if redirected back from login with plan param
  const planParam = searchParams.get("plan");
  if (
    user &&
    planParam &&
    (planParam === "pro" || planParam === "team") &&
    !isLoading
  ) {
    setTimeout(() => handleCheckout(planParam as "pro" | "team"), 0);
  }

  return (
    <Theme theme="g10">
      <div className={styles.container}>
        <div className={styles.hero}>
          <h1 className={styles.title}>選擇適合你的方案</h1>
          <p className={styles.subtitle}>
            所有方案皆包含完整功能，差異僅在用量額度
          </p>
        </div>

        <Grid className={styles.grid}>
          <Column lg={5} md={4} sm={4}>
            <PricingCard
              name="免費方案"
              price="NT$0"
              description="先以免費方案開始，需要更高額度時再升級"
              features={FREE_FEATURES}
              ctaLabel={user ? "目前方案" : "免費註冊"}
              onCtaClick={() => navigate(user ? "/dashboard" : "/register")}
              disabled={!!user}
            />
          </Column>

          <Column lg={5} md={4} sm={4}>
            <PricingCard
              name="Pro"
              price="NT$990"
              period="月"
              description="有穩定考試需求的用戶"
              features={PRO_FEATURES}
              ctaLabel={
                isPaid && tier === "pro"
                  ? "目前方案"
                  : isLoading
                    ? "處理中..."
                    : "開始免費試用"
              }
              onCtaClick={() => handleCheckout("pro")}
              highlighted
              badge="30 天免費"
              disabled={isLoading || (isPaid && tier === "pro")}
            />
          </Column>

          <Column lg={5} md={4} sm={4}>
            <PricingCard
              name="Team"
              price="NT$4,500"
              period="月"
              description="學校、科系、培訓機構"
              features={TEAM_FEATURES}
              ctaLabel={
                isPaid && tier === "team"
                  ? "目前方案"
                  : isLoading
                    ? "處理中..."
                    : "立即訂閱"
              }
              onCtaClick={() => handleCheckout("team")}
              disabled={isLoading || (isPaid && tier === "team")}
            />
          </Column>
        </Grid>

        <div className={styles.enterprise}>
          <h3>Enterprise</h3>
          <p>
            大型機構、企業招聘需求？我們提供客製方案與專屬支援。
          </p>
          <a href="mailto:support@qjudge.tw" className={styles.contactLink}>
            聯絡我們
          </a>
        </div>
      </div>
    </Theme>
  );
}
