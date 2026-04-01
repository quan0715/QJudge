import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Tag,
  Tabs,
  TabList,
  Tab,
} from "@carbon/react";
import {
  Bullhorn,
  Dashboard,
  Education,
  Settings,
  Trophy,
  UserMultiple,
} from "@carbon/icons-react";
import type {
  Classroom,
  ClassroomAnnouncement,
  ClassroomDetail,
} from "@/core/entities/classroom.entity";
import { getClassroomContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";
import { useToast } from "@/shared/contexts/ToastContext";
import { KpiCard } from "@/shared/ui/dataCard";
import {
  getClassroom,
  getClassrooms,
  deleteAnnouncement,
} from "@/infrastructure/api/repositories/classroom.repository";
import { AnnouncementModal } from "../components/AnnouncementModal";
import CreateContestModal from "@/features/classroom/components/CreateContestModal";
import ClassroomAdminLayout, { type ClassroomAdminPanelId } from "./ClassroomAdminLayout";
import { QJudgeHeroWidget } from "@/shared/layout/QJudgeHeroWidget";
import { ClassroomSkeleton } from "../components/ClassroomSkeleton";
import { AnnouncementSection } from "../components/AnnouncementSection";
import { AnnouncementViewModal } from "../components/AnnouncementViewModal";
import { OverviewPanel } from "./panels/OverviewPanel";
import { ContestPanel } from "./panels/ContestPanel";
import { MembersPanel } from "./panels/MembersPanel";
import { getClassroomIcon } from "../constants/classroomIcons";
import { useTabWithUrlParam } from "@/shared/hooks";
import { ClassroomSettingsModal } from "../components/ClassroomSettingsModal";
import "./ClassroomDetailScreen.scss";

const PANEL_ALIAS: Record<string, ClassroomAdminPanelId> = {
  announcement: "announcements",
  contest: "contests",
  member: "members",
};

const ClassroomDetailScreen: React.FC = () => {
  const { t } = useTranslation("classroom");
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { classroomId } = useParams<{ classroomId: string }>();

  const [classroom, setClassroom] = useState<ClassroomDetail | null>(null);
  const [classroomOptions, setClassroomOptions] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);

  const [createContestOpen, setCreateContestOpen] = useState(false);
  const [viewingAnnouncement, setViewingAnnouncement] = useState<ClassroomAnnouncement | null>(null);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<ClassroomAnnouncement | null>(null);

  const isPrivileged =
    classroom?.currentUserRole === "platform_admin" ||
    classroom?.currentUserRole === "owner" ||
    classroom?.currentUserRole === "manager";
  const isMember = Boolean(classroom?.currentUserRole);

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const availablePanels = useMemo<ClassroomAdminPanelId[]>(() => {
    if (isPrivileged || isMember) {
      return ["overview", "announcements", "contests", "members"];
    }
    return ["overview"];
  }, [isMember, isPrivileged]);

  const {
    activeKey: activePanel,
    activeIndex: selectedTabIndex,
    setActiveKey: handlePanelChange,
    setActiveIndex: handleTabChangeIndex,
  } = useTabWithUrlParam({
    param: "panel",
    keys: availablePanels,
    defaultKey: "overview",
    aliases: PANEL_ALIAS,
  });

  const fetchClassroomData = useCallback(async () => {
    if (!classroomId) return;
    try {
      setLoading(true);
      const data = await getClassroom(classroomId);
      if (!data) {
        showToast({
          kind: "error",
          title: t("notFound", "找不到教室"),
        });
        return;
      }
      setClassroom(data);
    } catch (error) {
      showToast({
        kind: "error",
        title: t("loadFailed", "載入教室失敗"),
        subtitle:
          error instanceof Error
            ? error.message
            : t("loadFailedHint", "請稍後再試"),
      });
    } finally {
      setLoading(false);
    }
  }, [classroomId, showToast, t]);

  const fetchClassroomOptions = useCallback(async () => {
    try {
      const rows = await getClassrooms();
      setClassroomOptions(rows);
    } catch (error) {
      showToast({
        kind: "error",
        title: t("switcherLoadFailed", "載入教室清單失敗"),
        subtitle:
          error instanceof Error
            ? error.message
            : t("loadFailedHint", "請稍後再試"),
      });
    }
  }, [showToast, t]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchClassroomData(), fetchClassroomOptions()]);
  }, [fetchClassroomData, fetchClassroomOptions]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleTabChange = ({ selectedIndex }: { selectedIndex: number }) => {
    handleTabChangeIndex(selectedIndex);
  };

  const handleClassroomSwitch = (targetId: string) => {
    if (!targetId || targetId === classroomId) return;
    navigate(`/classrooms/${targetId}`);
  };

  const handleCreateContest = async (contestId?: string) => {
    if (!contestId) return;
    showToast({
      kind: "success",
      title: t("createContestSuccess", "已建立考試"),
    });
    setCreateContestOpen(false);
    await fetchClassroomData();
    const targetClassroomId = classroomId || classroom?.id;
    if (targetClassroomId) {
      navigate(getClassroomContestDashboardPath(targetClassroomId, contestId));
    }
  };

  const handleDeleteAnnouncement = async () => {
    if (!classroomId) return;
    try {
      if (!viewingAnnouncement) return;
      await deleteAnnouncement(classroomId, viewingAnnouncement.id);
      showToast({
        kind: "success",
        title: t("announcementDeleted"),
      });
      setViewingAnnouncement(null);
      await fetchClassroomData();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("announcementDeleteFailed"),
        subtitle:
          error instanceof Error
            ? error.message
            : t("loadFailedHint", "請稍後再試"),
      });
    }
  };

  if (loading && !classroom) return <ClassroomSkeleton />;

  if (!classroom) {
    return (
      <div className="classroom-admin-empty">
        <Education size={48} className="classroom-admin-empty__icon" />
        <p>{t("notFound", "找不到教室")}</p>
        <Button kind="tertiary" size="sm" onClick={() => navigate("/dashboard")}>
          {t("backToClassrooms")}
        </Button>
      </div>
    );
  }

  const HeroIcon = getClassroomIcon(classroom.icon) as React.ComponentType<{
    size: number;
    className?: string;
  }>;
  const normalizedDescription = classroom.description?.trim() ?? "";
  const shouldShowDescription =
    normalizedDescription.length > 0 && normalizedDescription !== classroom.name.trim();

  return (
    <>
      <ClassroomAdminLayout
        classroomName={classroom.name}
        classroomOptions={classroomOptions.map((row) => ({ id: row.id, name: row.name, icon: row.icon }))}
        selectedClassroomId={classroomId || classroom.id}
        onClassroomSwitch={handleClassroomSwitch}
        onGoHome={() => navigate("/dashboard")}
        onOpenSettings={isPrivileged ? () => setSettingsModalOpen(true) : undefined}
      >
        <div className="classroom-admin-page">
          <QJudgeHeroWidget
            title={
              <>
                {classroom.name}
                {classroom.isArchived && (
                  <Tag type="red" size="sm">
                    {t("archived", "已封存")}
                  </Tag>
                )}
              </>
            }
            description={shouldShowDescription ? normalizedDescription : undefined}
            icon={HeroIcon}
            coverUrl={classroom.coverUrl || undefined}

            kpiCards={
              <KpiCard
                icon={UserMultiple}
                value={classroom.members.length}
                label={t("classroom.members", "成員")}
                showBorder={false}
              />
            }
            tabs={
              <Tabs
                selectedIndex={selectedTabIndex >= 0 ? selectedTabIndex : 0}
                onChange={handleTabChange}
              >
                <TabList aria-label={t("tabs", "教室分頁")}>
                  {availablePanels.map((panel) => (
                    <Tab key={panel} renderIcon={TAB_CONFIG[panel]?.icon}>
                      {TAB_CONFIG[panel]?.label(t) ?? panel}
                    </Tab>
                  ))}
                </TabList>
              </Tabs>
            }
          />

          <div className="classroom-admin-panel">
            {activePanel === "overview" && (
              <OverviewPanel
                classroom={classroom}
                isPrivileged={Boolean(isPrivileged)}
                onCreateAnnouncement={() => {
                  setEditingAnnouncement(null);
                  setAnnouncementModalOpen(true);
                }}
                onViewAnnouncement={setViewingAnnouncement}
                onCreateExam={() => setCreateContestOpen(true)}
                onNavigateExam={(contestId) =>
                  navigate(getClassroomContestDashboardPath(classroom.id, contestId))
                }
                onJumpToPanel={handlePanelChange}
              />
            )}

            {activePanel === "announcements" && (
              <AnnouncementSection
                announcements={classroom.announcements}
                isPrivileged={Boolean(isPrivileged)}
                onCreateClick={() => {
                  setEditingAnnouncement(null);
                  setAnnouncementModalOpen(true);
                }}
                onView={setViewingAnnouncement}
              />
            )}

            {activePanel === "contests" && (
              <ContestPanel
                exams={classroom.contests}
                canBindContests={Boolean(isPrivileged)}
                onCreateExam={() => setCreateContestOpen(true)}
                onNavigateExam={(contestId) =>
                  navigate(getClassroomContestDashboardPath(classroom.id, contestId))
                }
              />
            )}

            {activePanel === "members" && (
              <MembersPanel classroom={classroom} />
            )}

          </div>
        </div>
      </ClassroomAdminLayout>

      {isPrivileged && (
        <>
          <CreateContestModal
            open={createContestOpen}
            onClose={() => setCreateContestOpen(false)}
            classroomId={classroom.id}
            onCreated={(contestId) => {
              void handleCreateContest(contestId);
            }}
          />
          <ClassroomSettingsModal
            open={settingsModalOpen}
            onClose={() => setSettingsModalOpen(false)}
            classroom={classroom}
            onRefresh={refreshAll}
          />
        </>
      )}

      <AnnouncementViewModal
        announcement={viewingAnnouncement}
        canEdit={Boolean(isPrivileged)}
        onClose={() => setViewingAnnouncement(null)}
        onEdit={() => {
          setEditingAnnouncement(viewingAnnouncement);
          setViewingAnnouncement(null);
          setAnnouncementModalOpen(true);
        }}
        onDelete={() => {
          void handleDeleteAnnouncement();
        }}
      />

      <AnnouncementModal
        open={announcementModalOpen}
        classroomId={classroomId || ""}
        announcement={editingAnnouncement}
        onClose={() => setAnnouncementModalOpen(false)}
        onSaved={() => {
          setAnnouncementModalOpen(false);
          void fetchClassroomData();
        }}
      />
    </>
  );
};

// ── Tab config ──

type TFn = ReturnType<typeof useTranslation>["t"];

const TAB_CONFIG: Record<ClassroomAdminPanelId, { label: (t: TFn) => string; icon: any }> = {
  overview:      { label: (t) => t("tab.overview", "總覽"),      icon: Dashboard },
  announcements: { label: (t) => t("tab.announcements"), icon: Bullhorn },
  contests:      { label: (t) => t("tab.contests", "活動"),      icon: Trophy },
  members:       { label: (t) => t("tab.members", "成員"),       icon: UserMultiple },
  settings:      { label: (t) => t("tab.settings", "設定"),      icon: Settings },
};







export default ClassroomDetailScreen;
