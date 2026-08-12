import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Grid, Column, Tile, Loading } from "@carbon/react";
import { PageHeader } from "@/shared/layout/PageHeader";
import { BankGalleryCard } from "@/features/question-banks/components/BankGalleryCard";
import { listReviewQueue } from "@/infrastructure/api/repositories/questionBank.repository";
import type { QuestionBank } from "@/core/entities/question-bank.entity";
import styles from "./AdminScreens.module.scss";

const ReviewQueueScreen = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("common");

  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      try {
        const rows = await listReviewQueue();
        if (!cancelled) setBanks(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetch();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageInner}>
        <PageHeader title={t("header.reviewQueue", "送審佇列")} />

        {loading ? (
          <Loading
            withOverlay={false}
            description={t("message.loading", "載入中")}
          />
        ) : banks.length === 0 ? (
          <Tile>{t("questionBank.emptyReviewQueue", "目前沒有待審核題庫。")}</Tile>
        ) : (
          <Grid fullWidth>
            {banks.map((bank) => (
              <Column key={bank.id} lg={4} md={4} sm={4}>
                <BankGalleryCard
                  title={bank.name}
                  category={bank.category}
                  provider={bank.ownerUsername || "-"}
                  providerVerified={bank.verified}
                  downloads={String(Math.max(1, bank.questionCount))}
                  coverUrl={bank.coverUrl || undefined}
                  icon={bank.icon || undefined}
                  onClick={() => navigate(`/question-banks/${bank.id}?panel=settings`)}
                />
              </Column>
            ))}
          </Grid>
        )}
      </div>
    </div>
  );
};

export default ReviewQueueScreen;
