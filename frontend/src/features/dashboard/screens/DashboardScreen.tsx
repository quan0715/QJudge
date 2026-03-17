import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, ClickableTile, Column, Grid, SkeletonPlaceholder, Stack, Tag, Tile } from "@carbon/react";
import { Add, Education, Launch, UserMultiple } from "@carbon/icons-react";
import { PageHeader } from "@/shared/layout/PageHeader";
import { createClassroom, getClassrooms } from "@/infrastructure/api/repositories/classroom.repository";
import type { Classroom } from "@/core/entities/classroom.entity";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useToast } from "@/shared/contexts/ToastContext";
import { JoinClassroomModal } from "@/features/classroom/components/JoinClassroomModal";
import { CreateClassroomModal } from "@/features/classroom/components/CreateClassroomModal";
import "./DashboardScreen.scss";

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

  useEffect(() => {
    let cancelled = false;

    const fetchClassrooms = async () => {
      setLoading(true);
      try {
        const rows = await getClassrooms();
        if (!cancelled) setClassrooms(rows);
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
        if (!cancelled) setLoading(false);
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

  const managedClassrooms = useMemo(
    () =>
      classrooms.filter(
        (classroom) =>
          classroom.currentUserRole === "admin" || classroom.currentUserRole === "teacher"
      ),
    [classrooms]
  );

  const enrolledClassrooms = useMemo(
    () =>
      classrooms.filter(
        (classroom) =>
          classroom.currentUserRole === "student" || classroom.currentUserRole === "ta"
      ),
    [classrooms]
  );

  const recentClassrooms = useMemo(() => classrooms.slice(0, 8), [classrooms]);

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
        {items.map((classroom) => (
          <ClickableTile
            key={classroom.id}
            className="dashboard-classroom__card"
            onClick={() => navigate(`/classrooms/${classroom.id}`)}
          >
            <div className="dashboard-classroom__card-header">
              <h4 className="dashboard-classroom__card-title">{classroom.name}</h4>
              <Tag type="blue" size="sm">
                {classroom.currentUserRole || "member"}
              </Tag>
            </div>
            <p className="dashboard-classroom__card-description">
              {classroom.description ||
                t("dashboard.classroomHub.noDescription", "尚未設定教室描述")}
            </p>
            <p className="dashboard-classroom__card-meta">
              <UserMultiple size={14} />
              {classroom.memberCount} {t("classroom.members", "members")} · {classroom.ownerUsername}
            </p>
          </ClickableTile>
        ))}
      </div>
    );
  };

  return (
    <div className="dashboard-classroom">
      <Grid fullWidth className="dashboard-classroom__layout">
        <Column lg={16} md={8} sm={4}>
          <PageHeader
            title={t("dashboard.classroomHub.selectTitle", "先選擇教室")}
            subtitle={t("dashboard.classroomHub.selectSubtitle", "從教室入口進入你的教室主頁")}
            action={
              <Stack orientation="horizontal" gap={3}>
                <Button kind="tertiary" size="sm" onClick={() => setJoinOpen(true)}>
                  {t("classroom.join", "加入教室")}
                </Button>
                {isTeacherOrAdmin ? (
                  <Button
                    kind="primary"
                    size="sm"
                    renderIcon={Add}
                    onClick={() => setCreateOpen(true)}
                  >
                    {t("classroom.create", "建立教室")}
                  </Button>
                ) : null}
              </Stack>
            }
          />
        </Column>

        <Column lg={16} md={8} sm={4}>
          <Tile className="dashboard-classroom__hero">
            <div className="dashboard-classroom__hero-content">
              <div>
                <p className="dashboard-classroom__hero-overline">
                  {t("dashboard.classroomHub.mainFlow", "主流程")}
                </p>
                <h3 className="dashboard-classroom__hero-title">
                  {t("dashboard.classroomHub.mainFlowTitle", "選擇教室 → 進入教室主頁")}
                </h3>
                <p className="dashboard-classroom__hero-description">
                  {t(
                    "dashboard.classroomHub.mainFlowDesc",
                    "點擊下方任一教室卡片，直接開啟該教室的管理與學習入口。"
                  )}
                </p>
              </div>
              <Stack orientation="horizontal" gap={4}>
                {recentClassrooms[0] ? (
                  <Button
                    kind="primary"
                    renderIcon={Launch}
                    onClick={() => navigate(`/classrooms/${recentClassrooms[0].id}`)}
                  >
                    {t("dashboard.classroomHub.quickEnter", "快速進入最近教室")}
                  </Button>
                ) : null}
              </Stack>
            </div>
          </Tile>
        </Column>

        {isTeacherOrAdmin ? (
          <>
            <Column lg={16} md={8} sm={4}>
              <section className="dashboard-classroom__section">
                <header className="dashboard-classroom__section-header">
                  <h4>{t("classroom.managed", "我管理的")}</h4>
                </header>
                {renderClassroomGrid(managedClassrooms)}
              </section>
            </Column>

            <Column lg={16} md={8} sm={4}>
              <section className="dashboard-classroom__section">
                <header className="dashboard-classroom__section-header">
                  <h4>{t("classroom.enrolled", "已加入的")}</h4>
                </header>
                {renderClassroomGrid(enrolledClassrooms)}
              </section>
            </Column>
          </>
        ) : (
          <Column lg={16} md={8} sm={4}>
            <section className="dashboard-classroom__section">
              <header className="dashboard-classroom__section-header">
                <h4>{t("classroom.enrolled", "已加入的")}</h4>
              </header>
              {renderClassroomGrid(recentClassrooms)}
            </section>
          </Column>
        )}
      </Grid>

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
