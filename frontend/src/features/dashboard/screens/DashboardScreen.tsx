import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, ClickableTile, Column, Grid, SkeletonPlaceholder, Stack, Tile } from "@carbon/react";
import { Add, Education, UserMultiple } from "@carbon/icons-react";
import { PageHeader } from "@/shared/layout/PageHeader";
import { getClassroomIcon } from "@/features/classroom/constants/classroomIcons";
import { createClassroom, getClassrooms } from "@/infrastructure/api/repositories/classroom.repository";
import type { Classroom } from "@/core/entities/classroom.entity";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useToast } from "@/shared/contexts/ToastContext";
import { JoinClassroomModal } from "@/features/classroom/components/JoinClassroomModal";
import { CreateClassroomModal } from "@/features/classroom/components/CreateClassroomModal";
import "./DashboardScreen.scss";

const CLASSROOM_BANNER_IMAGES = [
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80",
] as const;

const hashValue = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getClassroomBannerImage = (id: string) =>
  CLASSROOM_BANNER_IMAGES[hashValue(id) % CLASSROOM_BANNER_IMAGES.length];

const DashboardScreen = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";
  const welcomeName = user?.profile?.display_name?.trim() || user?.username || t("common.user", "使用者");

  useEffect(() => {
    let cancelled = false;

    const fetchClassrooms = async () => {
      setLoading(true);
      try {
        const rows = await getClassrooms();
        if (!cancelled) {
          setClassrooms(rows);
        }
      } catch (error) {
        if (!cancelled) {
          showToast({
            kind: "error",
            title: t("dashboard.classroomHub.loadFailed", "載入教室失敗"),
            subtitle:
              error instanceof Error
                ? error.message
                : t("dashboard.classroomHub.loadFailedHint", "請稍後再試"),
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchClassrooms();
    return () => {
      cancelled = true;
    };
  }, [showToast, t]);

  const refreshClassrooms = async () => {
    setLoading(true);
    try {
      const rows = await getClassrooms();
      setClassrooms(rows);
    } catch (error) {
      showToast({
        kind: "error",
        title: t("dashboard.classroomHub.loadFailed", "載入教室失敗"),
        subtitle:
          error instanceof Error
            ? error.message
            : t("dashboard.classroomHub.loadFailedHint", "請稍後再試"),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClassroom = async (name: string, description: string) => {
    try {
      const created = await createClassroom({ name, description });
      setCreateOpen(false);
      showToast({
        kind: "success",
        title: t("classroom.createSuccess", "教室建立成功"),
      });
      await refreshClassrooms();
      navigate(`/classrooms/${created.id}`);
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.createFailed", "建立教室失敗"),
        subtitle:
          error instanceof Error
            ? error.message
            : t("dashboard.classroomHub.loadFailedHint", "請稍後再試"),
      });
    }
  };

  const orderedClassrooms = useMemo(() => {
    const rank: Record<string, number> = { admin: 0, teacher: 1, ta: 2, student: 3 };
    return [...classrooms].sort((a, b) => {
      const ra = rank[a.currentUserRole ?? "student"] ?? 99;
      const rb = rank[b.currentUserRole ?? "student"] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  }, [classrooms]);

  const renderClassroomGrid = (items: Classroom[]) => {
    if (loading) {
      return (
        <div className="dashboard-classroom__grid">
          {Array.from({ length: 4 }).map((_, idx) => (
            <SkeletonPlaceholder key={idx} className="dashboard-classroom__skeleton" />
          ))}
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <Tile className="dashboard-classroom__empty-tile">
          <div className="dashboard-classroom__empty">
            <Education size={32} />
            <div>
              <h4>{t("dashboard.classroomHub.emptyTitle", "尚未加入任何教室")}</h4>
              <p>{t("dashboard.classroomHub.emptyDesc", "先建立教室或透過邀請碼加入教室。")}</p>
            </div>
            <Stack orientation="horizontal" gap={3}>
              <Button kind="tertiary" onClick={() => setJoinOpen(true)}>
                {t("classroom.join", "加入教室")}
              </Button>
              {isTeacherOrAdmin ? (
                <Button kind="primary" renderIcon={Add} onClick={() => setCreateOpen(true)}>
                  {t("classroom.create", "建立教室")}
                </Button>
              ) : null}
            </Stack>
          </div>
        </Tile>
      );
    }

    return (
      <div className="dashboard-classroom__grid">
        {items.map((classroom) => {
          const bannerImage = classroom.coverUrl || getClassroomBannerImage(classroom.id);
          const CardIcon = getClassroomIcon(classroom.icon);
          return (
            <ClickableTile
              key={classroom.id}
              className="dashboard-classroom__card"
              onClick={() => navigate(`/classrooms/${classroom.id}`)}
            >
              <div
                className="dashboard-classroom__card-banner"
                style={{
                  backgroundImage: `linear-gradient(150deg, rgba(9, 30, 66, 0.18) 0%, rgba(6, 16, 36, 0.78) 72%, rgba(6, 16, 36, 0.92) 100%), url(${bannerImage})`,
                }}
              >
                <h4 className="dashboard-classroom__card-title">{classroom.name}</h4>
                <div className="dashboard-classroom__card-avatar">
                  <CardIcon size={20} />
                </div>
              </div>

              <div className="dashboard-classroom__card-body">
                <p className="dashboard-classroom__card-description">
                  {classroom.description || t("dashboard.classroomHub.noDescription", "尚未設定教室描述")}
                </p>
                <p className="dashboard-classroom__card-meta">
                  <UserMultiple size={14} />
                  {classroom.memberCount} {t("classroom.members", "members")}
                </p>
              </div>
            </ClickableTile>
          );
        })}
      </div>
    );
  };

  return (
    <div className="dashboard-classroom">
      <section className="dashboard-classroom__main">
        <Grid fullWidth className="dashboard-classroom__layout">
          <Column lg={16} md={8} sm={4}>
            <PageHeader
              title={`${welcomeName} ${t("dashboard.classroomHub.welcomeBack", "歡迎回來")}`}
              subtitle={t("dashboard.classroomHub.selectSubtitle", "選一個教室，直接進入教室主頁")}
              action={
                <Stack orientation="horizontal" gap={3}>
                  <Button kind="tertiary" onClick={() => setJoinOpen(true)}>
                    {t("classroom.join", "加入教室")}
                  </Button>
                  {isTeacherOrAdmin ? (
                    <Button kind="primary" renderIcon={Add} onClick={() => setCreateOpen(true)}>
                      {t("classroom.create", "建立教室")}
                    </Button>
                  ) : null}
                </Stack>
              }
            />
          </Column>

          <Column lg={16} md={8} sm={4}>
            <section className="dashboard-classroom__section">
              <header className="dashboard-classroom__section-header">
                <h4>{t("dashboard.classroomHub.listTitle", "我的教室")}</h4>
              </header>
              {renderClassroomGrid(orderedClassrooms)}
            </section>
          </Column>
        </Grid>
      </section>

      <JoinClassroomModal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={() => {
          setJoinOpen(false);
          void refreshClassrooms();
        }}
      />

      {isTeacherOrAdmin ? (
        <CreateClassroomModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreateClassroom}
        />
      ) : null}
    </div>
  );
};

export default DashboardScreen;
