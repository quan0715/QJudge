import React, { useState, useEffect } from "react";
import { SkeletonText, Tile } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { Section } from "@/shared/layout/SettingsPanel";
import { httpClient } from "@/infrastructure/api/http.client";

interface CreditData {
  total_credits: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_requests: number;
  total_cost_cents: number;
  total_cost_usd: string;
  updated_at: string | null;
}

export const AIUsagePanel: React.FC = () => {
  const { t } = useTranslation();
  const [credit, setCredit] = useState<CreditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await httpClient.get("/api/v1/ai/sessions/credit/");
        const data = await res.json() as CreditData;
        if (!cancelled) setCredit(data);
      } catch (err) {
        if (!cancelled) setError(t("settings.aiUsage.loadError", "無法載入使用量資料"));
        console.warn("Failed to load AI credit:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

  if (loading) {
    return (
      <Section title={t("settings.aiUsage.title", "AI 使用量")}>
        <SkeletonText paragraph lineCount={3} />
      </Section>
    );
  }

  if (error || !credit) {
    return (
      <Section title={t("settings.aiUsage.title", "AI 使用量")}>
        <p style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
          {error || t("settings.aiUsage.noData", "無資料")}
        </p>
      </Section>
    );
  }

  const stats = [
    { label: t("settings.aiUsage.totalCredits", "已使用 AI Credits"), value: (credit.total_credits ?? 0).toLocaleString() },
    { label: t("settings.aiUsage.totalRequests", "總請求數"), value: (credit.total_requests ?? 0).toLocaleString() },
  ];

  return (
    <Section title={t("settings.aiUsage.title", "AI 使用量")}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
        {stats.map((s) => (
          <Tile key={s.label} style={{ padding: "1rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
              {s.label}
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>
              {s.value}
            </div>
          </Tile>
        ))}
      </div>
      {credit.updated_at && (
        <p style={{ fontSize: "0.75rem", color: "var(--cds-text-helper)", marginTop: "0.75rem" }}>
          {t("settings.aiUsage.lastUpdated", "最後更新")}：{new Date(credit.updated_at).toLocaleString("zh-TW")}
        </p>
      )}
    </Section>
  );
};
