import React, { useState, useEffect } from "react";
import { SkeletonText, Tile } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { Section } from "@/shared/layout/SettingsPanel";
import { httpClient } from "@/infrastructure/api/http.client";

interface CreditData {
  total_input_tokens: number;
  total_output_tokens: number;
  total_requests: number;
  total_cost_cents: number;
  total_cost_usd: string;
  updated_at: string | null;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
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
        if (!cancelled) setCredit(res as CreditData);
      } catch (err) {
        if (!cancelled) setError("無法載入使用量資料");
        console.warn("Failed to load AI credit:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
          {error || "無資料"}
        </p>
      </Section>
    );
  }

  const stats = [
    { label: "總請求數", value: credit.total_requests.toLocaleString() },
    { label: "輸入 Tokens", value: formatNumber(credit.total_input_tokens) },
    { label: "輸出 Tokens", value: formatNumber(credit.total_output_tokens) },
    { label: "累計費用", value: `$${credit.total_cost_usd} USD` },
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
          最後更新：{new Date(credit.updated_at).toLocaleString("zh-TW")}
        </p>
      )}
    </Section>
  );
};
