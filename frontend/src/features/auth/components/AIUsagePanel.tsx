import React, { useState, useEffect } from "react";
import { SkeletonText, Tile } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { Section } from "@/shared/layout/SettingsPanel";
import { httpClient } from "@/infrastructure/api/http.client";

interface UsageData {
  total_input_tokens: number;
  total_output_tokens: number;
  total_runs: number;
  updated_at: string | null;
}

export const AIUsagePanel: React.FC = () => {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await httpClient.get("/api/v1/ai/usage/");
        if (!res.ok) throw new Error(`Usage request failed (${res.status})`);
        const data = await res.json() as UsageData;
        if (!cancelled) setUsage(data);
      } catch (err) {
        if (!cancelled) setLoadFailed(true);
        console.warn("Failed to load AI usage:", err);
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

  if (loadFailed || !usage) {
    return (
      <Section title={t("settings.aiUsage.title", "AI 使用量")}>
        <p style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
          {loadFailed
            ? t("settings.aiUsage.loadError", "無法載入使用量資料")
            : t("settings.aiUsage.noData", "無資料")}
        </p>
      </Section>
    );
  }

  const stats = [
    {
      label: t("settings.aiUsage.inputTokens", "輸入 Tokens"),
      value: (usage.total_input_tokens ?? 0).toLocaleString(),
    },
    {
      label: t("settings.aiUsage.outputTokens", "輸出 Tokens"),
      value: (usage.total_output_tokens ?? 0).toLocaleString(),
    },
    {
      label: t("settings.aiUsage.aiRuns", "AI 執行次數"),
      value: (usage.total_runs ?? 0).toLocaleString(),
    },
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
      {usage.updated_at && (
        <p style={{ fontSize: "0.75rem", color: "var(--cds-text-helper)", marginTop: "0.75rem" }}>
          {t("settings.aiUsage.lastUpdated", "最後更新")}：{new Date(usage.updated_at).toLocaleString("zh-TW")}
        </p>
      )}
    </Section>
  );
};
