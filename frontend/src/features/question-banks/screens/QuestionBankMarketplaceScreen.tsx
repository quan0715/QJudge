import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Grid, Column, Loading, Tile } from "@carbon/react";
import { PageHeader } from "@/shared/layout/PageHeader";
import { useToast } from "@/shared/contexts";
import type { ExploreBankItem } from "@/core/entities/question-bank.entity";
import { listExplore } from "@/infrastructure/api/repositories/questionBank.repository";
import { BankGalleryCard } from "@/features/question-banks/components/BankGalleryCard";

const QuestionBankMarketplaceScreen = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [exploreBanks, setExploreBanks] = useState<ExploreBankItem[]>([]);

  const buildMetric = (value: number): string => {
    if (value >= 1000) {
      const rounded = (value / 1000).toFixed(1);
      return `${rounded.replace(".0", "")}k`;
    }
    return String(value);
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const rows = await listExplore();
        setExploreBanks(rows);
      } catch (err: any) {
        showToast({
          kind: "error",
          title: t("message.error"),
          subtitle: err?.message || t("message.error"),
        });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [showToast, t]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", marginTop: "4rem" }}>
        <Loading withOverlay={false} description={t("message.loading")} />
      </div>
    );
  }

  return (
    <Grid fullWidth>
      <Column lg={16} md={8} sm={4}>
        <PageHeader
          title={t("nav.marketplace", "Marketplace")}
          subtitle={t("questionBank.marketplaceSubtitle", "探索由平台提供的題庫")}
        />
      </Column>

      <Column lg={16} md={8} sm={4}>
        {exploreBanks.length === 0 ? (
          <Tile>
            {t(
              "questionBank.emptyExplore",
              "探索題庫目前僅平台提供；暫無可探索內容。"
            )}
          </Tile>
        ) : (
          <Grid fullWidth>
            {exploreBanks.map((bank) => (
              <Column key={bank.id} lg={4} md={4} sm={4}>
                <BankGalleryCard
                  title={bank.name}
                  category={bank.category}
                  provider={bank.ownerUsername || t("questionBank.mockOwnerPlatform", "QJudge Community")}
                  providerVerified={bank.verified}
                  downloads={buildMetric(Math.max(300, bank.questionCount * 96))}
                  coverUrl={bank.coverUrl || undefined}
                  icon={bank.icon || undefined}
                  onClick={() => navigate(`/marketplace/${bank.id}`)}
                />
              </Column>
            ))}
          </Grid>
        )}
      </Column>
    </Grid>
  );
};

export default QuestionBankMarketplaceScreen;
