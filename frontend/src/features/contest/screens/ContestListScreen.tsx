import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Grid, Column, Stack, SkeletonText } from "@carbon/react";
import { useNavigate } from "react-router-dom";
import { getContests } from "@/infrastructure/api/repositories";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import type { Contest } from "@/core/entities/contest.entity";
import { PageHeader } from "@/shared/layout/PageHeader";
import { ContestPreviewCard } from "@/features/contest/components/ContestPreviewCard";
import "./ContestListScreen.scss";

const ContestListScreen: React.FC = () => {
  const { t } = useTranslation("contest");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContests = async () => {
      try {
        const visibleData = await getContests();
        setContests(visibleData);
      } catch (error) {
        console.error("Failed to fetch contests", error);
      } finally {
        setLoading(false);
      }
    };
    fetchContests();
  }, [user]);

  const now = useMemo(() => new Date(), []);
  const visibleContests = contests.filter((c) => c.status === "published");

  const ongoing = visibleContests.filter((c) => {
    const start = new Date(c.startTime);
    const end = new Date(c.endTime);
    return start <= now && end >= now;
  });

  const upcoming = visibleContests.filter((c) => {
    const start = new Date(c.startTime);
    return start > now;
  });

  const past = visibleContests.filter((c) => {
    const end = new Date(c.endTime);
    return end < now;
  });

  const navigateToContest = (contest: Contest) => navigate(`/contests/${contest.id}`);

  const renderGrid = (items: Contest[]) => {
    if (loading) {
      return (
        <div className="contest-list-grid">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="contest-card-skeleton">
              <SkeletonText heading width="60%" />
              <SkeletonText width="40%" />
              <SkeletonText width="50%" />
            </div>
          ))}
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="contest-list-grid">
          <div className="contest-card-empty">
            <span className="contest-card-empty__icon" aria-hidden>
              ●
            </span>
            <p>{t("list.empty", "目前沒有新競賽")}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="contest-list-grid">
        {items.map((contest) => (
          <ContestPreviewCard
            key={contest.id}
            contest={contest}
            onSelect={() => navigateToContest(contest)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="contest-list-screen">
      <Grid fullWidth className="contest-list-screen__grid">
        <Column lg={16} md={8} sm={4}>
          <PageHeader
            title={t("list.title", "競賽列表")}
            subtitle={t("list.subtitle", "瀏覽並報名競賽")}
          />
        </Column>
        <Column lg={16} md={8} sm={4}>
          <Stack gap={5}>
            <div className="contest-list-section">
              <h4 className="contest-list-section__title">
                {t("list.ongoingAndUpcoming", "進行中 / 即將開始")}
              </h4>
              {renderGrid([...ongoing, ...upcoming])}
            </div>
            <div className="contest-list-section">
              <h4 className="contest-list-section__title">
                {t("list.past", "已結束")}
              </h4>
              {renderGrid(past)}
            </div>
          </Stack>
        </Column>
      </Grid>
    </div>
  );
};

export default ContestListScreen;
