import { useState, useEffect } from "react";
import { Grid, Column, Tile, SkeletonPlaceholder } from "@carbon/react";
import { Trophy } from "@carbon/icons-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/shared/layout/PageHeader";
import StatsCard from "@/features/dashboard/components/StatsCard";
import AnnouncementsSection from "@/features/dashboard/components/AnnouncementsSection";
import ContestPreviewCard from "@/features/contest/components/ContestPreviewCard";
import { getUserStats } from "@/infrastructure/api/repositories/auth.repository";
import { getAnnouncements, type Announcement } from "@/infrastructure/api/repositories/announcement.repository";
import { getContests } from "@/infrastructure/api/repositories";
import type { Contest } from "@/core/entities/contest.entity";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useContentLanguage } from "@/shared/contexts/ContentLanguageContext";
import "./DashboardScreen.scss";

interface UserStats {
  total_solved: number;
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
  total_easy: number;
  total_medium: number;
  total_hard: number;
}

const DashboardScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { contentLanguage } = useContentLanguage();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);

  const isContestOngoing = (contest: Contest) => {
    const now = new Date();
    const startTime = new Date(contest.startTime);
    const endTime = new Date(contest.endTime);

    return contest.status === "published" && startTime <= now && endTime > now;
  };

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsData, announcementsData, contestsData] = await Promise.all([
          getUserStats().catch(() => null),
          getAnnouncements().catch(() => []),
          getContests().catch(() => []),
        ]);

        if (cancelled) return;

        setStats(statsData);
        setAnnouncements(
          (announcementsData || [])
            .filter((a: Announcement) => a.visible)
            .slice(0, 5)
        );
        const ongoingContests = (contestsData || [])
          .filter(isContestOngoing)
          .slice(0, 6);
        setContests(ongoingContests);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch dashboard data:", error);
        }
      }
      finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const formatDate = (dateStr: string) => {
    const locale = contentLanguage === "zh-TW" ? "zh-TW" : "en-US";
    return new Date(dateStr).toLocaleString(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="dashboard-page">
      <Grid fullWidth className="dashboard-page__grid">
        <Column lg={16} md={8} sm={4}>
          <PageHeader
            title={t("dashboard.welcomeBack", { name: user?.username || "User" })}
            subtitle={t("dashboard.subtitle")}
          />
        </Column>

        <Column lg={8} md={8} sm={4} className="dashboard-page__column">
          <StatsCard
            loading={loading}
            stats={stats}
            title={t("dashboard.stats.title")}
            subtitle={t("dashboard.stats.problems")}
          />
        </Column>

        <Column lg={8} md={8} sm={4} className="dashboard-page__column">
          <Tile className="dashboard-page__section">
            <div className="dashboard-page__section-header">
              <Trophy size={24} />
              <div>
                <h4 className="dashboard-page__section-title">
                  {t("dashboard.contests.title")}
                </h4>
                <p className="dashboard-page__section-subtitle">
                  {t("dashboard.contests.ongoing", {
                    defaultValue: "僅顯示進行中競賽",
                  })}
                </p>
              </div>
            </div>
            {loading ? (
              <div className="dashboard-page__contests-grid">
                <SkeletonPlaceholder />
                <SkeletonPlaceholder />
              </div>
            ) : contests.length > 0 ? (
              <div className="dashboard-page__contests-grid">
                {contests.map((contest) => (
                  <ContestPreviewCard
                    key={contest.id}
                    contest={contest}
                    onSelect={() => navigate(`/contests/${contest.id}`)}
                  />
                ))}
              </div>
            ) : (
              <p className="dashboard-page__empty">
                {t("dashboard.contests.noContests", {
                  defaultValue: "目前沒有新競賽",
                })}
              </p>
            )}
          </Tile>
        </Column>

        <Column lg={16} md={8} sm={4}>
          <AnnouncementsSection
            announcements={announcements}
            loading={loading}
            title={t("dashboard.announcements.title")}
            subtitle={t("dashboard.announcements.subtitle", {
              defaultValue: "最新公告",
            })}
            emptyMessage={t("dashboard.announcements.noAnnouncements")}
            formatDate={formatDate}
          />
        </Column>
      </Grid>
    </div>
  );
};

export default DashboardScreen;
