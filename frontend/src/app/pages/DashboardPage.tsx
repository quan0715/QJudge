import { useState, useEffect } from "react";
import { Grid, Column, Tile, SkeletonText, Tag } from "@carbon/react";
import {
  Calendar,
  Trophy,
  DocumentMultiple_02,
  CheckmarkOutline,
} from "@carbon/icons-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/ui/layout/PageHeader";
import { getUserStats } from "@/services/auth";
import { getAnnouncements, type Announcement } from "@/services/announcement";
import { getContests } from "@/services/contest";
import type { Contest } from "@/core/entities/contest.entity";
import { useAuth } from "@/domains/auth/contexts/AuthContext";
import { useContentLanguage } from "@/contexts/ContentLanguageContext";

interface UserStats {
  total_solved: number;
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
  total_easy: number;
  total_medium: number;
  total_hard: number;
}

const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { contentLanguage } = useContentLanguage();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, announcementsData, contestsData] = await Promise.all([
          getUserStats().catch(() => null),
          getAnnouncements().catch(() => []),
          getContests().catch(() => []),
        ]);

        setStats(statsData);
        setAnnouncements(
          announcementsData.filter((a: Announcement) => a.visible).slice(0, 5)
        );

        // Filter upcoming or ongoing contests (exclude inactive)
        const now = new Date();
        const activeContests = contestsData
          .filter((c: Contest) => {
            // Exclude inactive contests
            if (c.status === "inactive") return false;
            const endTime = new Date(c.endTime);
            return endTime > now;
          })
          .slice(0, 5);
        setContests(activeContests);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getContestStatus = (contest: Contest) => {
    const now = new Date();
    const startTime = new Date(contest.startTime);
    const endTime = new Date(contest.endTime);

    if (now < startTime)
      return { label: t("dashboard.contests.upcoming"), kind: "blue" as const };
    if (now >= startTime && now <= endTime)
      return { label: t("dashboard.contests.ongoing"), kind: "green" as const };
    return { label: t("dashboard.contests.ended"), kind: "gray" as const };
  };

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
    <>
      <PageHeader
        title={t("dashboard.welcomeBack", { name: user?.username || "User" })}
        subtitle={t("dashboard.subtitle")}
      />
      <Grid style={{ padding: "2rem 0" }}>
        {/* User Stats Section */}
        <Column lg={8} md={8} sm={4} style={{ marginBottom: "1.5rem" }}>
          <Tile style={{ height: "100%" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <CheckmarkOutline size={24} style={{ marginRight: "0.5rem" }} />
              <h4 style={{ margin: 0 }}>{t("dashboard.stats.title")}</h4>
            </div>
            {loading ? (
              <SkeletonText paragraph lineCount={4} />
            ) : stats ? (
              <div>
                <div
                  style={{
                    fontSize: "2.5rem",
                    fontWeight: "bold",
                    marginBottom: "1rem",
                  }}
                >
                  {stats.total_solved}
                  <span
                    style={{
                      fontSize: "1rem",
                      fontWeight: "normal",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    {" "}
                    / {stats.total_easy +
                      stats.total_medium +
                      stats.total_hard}{" "}
                    {t("dashboard.stats.problems")}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <div
                    style={{
                      padding: "0.75rem 1rem",
                      backgroundColor: "var(--cds-layer-02)",
                      borderRadius: "4px",
                      flex: 1,
                      minWidth: "80px",
                    }}
                  >
                    <div style={{ color: "#22c55e", fontWeight: "bold" }}>
                      {t("dashboard.difficulty.easy")}
                    </div>
                    <div>
                      {stats.easy_solved} / {stats.total_easy}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "0.75rem 1rem",
                      backgroundColor: "var(--cds-layer-02)",
                      borderRadius: "4px",
                      flex: 1,
                      minWidth: "80px",
                    }}
                  >
                    <div style={{ color: "#f59e0b", fontWeight: "bold" }}>
                      {t("dashboard.difficulty.medium")}
                    </div>
                    <div>
                      {stats.medium_solved} / {stats.total_medium}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "0.75rem 1rem",
                      backgroundColor: "var(--cds-layer-02)",
                      borderRadius: "4px",
                      flex: 1,
                      minWidth: "80px",
                    }}
                  >
                    <div style={{ color: "#ef4444", fontWeight: "bold" }}>
                      {t("dashboard.difficulty.hard")}
                    </div>
                    <div>
                      {stats.hard_solved} / {stats.total_hard}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: "var(--cds-text-secondary)" }}>
                {t("dashboard.stats.noStats")}
              </p>
            )}
          </Tile>
        </Column>

        {/* Recent Contests Section */}
        <Column lg={8} md={8} sm={4} style={{ marginBottom: "1.5rem" }}>
          <Tile style={{ height: "100%" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <Trophy size={24} style={{ marginRight: "0.5rem" }} />
              <h4 style={{ margin: 0 }}>{t("dashboard.contests.title")}</h4>
            </div>
            {loading ? (
              <SkeletonText paragraph lineCount={4} />
            ) : contests.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {contests.map((contest) => {
                  const status = getContestStatus(contest);
                  return (
                    <div
                      key={contest.id}
                      onClick={() => navigate(`/contests/${contest.id}`)}
                      style={{
                        padding: "0.75rem",
                        backgroundColor: "var(--cds-layer-02)",
                        borderRadius: "4px",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500 }}>{contest.name}</div>
                        <div
                          style={{
                            fontSize: "0.875rem",
                            color: "var(--cds-text-secondary)",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <Calendar size={14} />
                          {formatDate(contest.startTime)}
                        </div>
                      </div>
                      <Tag type={status.kind} size="sm">
                        {status.label}
                      </Tag>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: "var(--cds-text-secondary)" }}>
                {t("dashboard.contests.noContests")}
              </p>
            )}
          </Tile>
        </Column>

        {/* Announcements Section */}
        <Column lg={16} md={8} sm={4}>
          <Tile>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <DocumentMultiple_02
                size={24}
                style={{ marginRight: "0.5rem" }}
              />
              <h4 style={{ margin: 0 }}>
                {t("dashboard.announcements.title")}
              </h4>
            </div>
            {loading ? (
              <SkeletonText paragraph lineCount={3} />
            ) : announcements.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                {announcements.map((announcement) => (
                  <div
                    key={announcement.id}
                    style={{
                      padding: "1rem",
                      backgroundColor: "var(--cds-layer-02)",
                      borderRadius: "4px",
                      borderLeft: "4px solid var(--cds-link-primary)",
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                      {announcement.title}
                    </div>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--cds-text-secondary)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {announcement.content.length > 200
                        ? announcement.content.substring(0, 200) + "..."
                        : announcement.content}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--cds-text-helper)",
                      }}
                    >
                      {announcement.author?.username} •{" "}
                      {formatDate(announcement.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--cds-text-secondary)" }}>
                {t("dashboard.announcements.noAnnouncements")}
              </p>
            )}
          </Tile>
        </Column>
      </Grid>
    </>
  );
};

export default DashboardPage;
