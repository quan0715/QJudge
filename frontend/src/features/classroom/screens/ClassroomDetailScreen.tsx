import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Tag, Tabs, TabList, Tab } from "@carbon/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Bullhorn,
  Dashboard,
  Education,
  Settings,
  Trophy,
  UserMultiple,
} from "@carbon/icons-react";
import type {
  ClassroomAnnouncement,
  ClassroomDetail,
} from "@/core/entities/classroom.entity";
import {
  getClassroomContestAdminPath,
  getClassroomContestDashboardPath,
} from "@/features/contest/domain/contestRoutePolicy";
import { useToast } from "@/shared/contexts/ToastContext";
import { KpiCard } from "@/shared/ui/dataCard";
import {
  getClassroom,
  deleteClassroom,
  deleteAnnouncement,
} from "@/infrastructure/api/repositories/classroom.repository";
import { AnnouncementModal } from "../components/AnnouncementModal";
import CreateContestModal from "@/features/classroom/components/CreateContestModal";
import ClassroomAdminLayout, {
  type ClassroomAdminPanelId,
} from "./ClassroomAdminLayout";
import { QJudgeHeroWidget } from "@/shared/layout/QJudgeHeroWidget";
import { ClassroomSkeleton } from "../components/ClassroomSkeleton";
import { AnnouncementSection } from "../components/AnnouncementSection";
import { AnnouncementViewModal } from "../components/AnnouncementViewModal";
import { OverviewPanel } from "./panels/OverviewPanel";
import { ContestPanel } from "./panels/ContestPanel";
import { MembersPanel } from "./panels/MembersPanel";
import { getClassroomIcon } from "../constants/classroomIcons";
import { CLASSROOM_OPEN_SETTINGS_QUERY } from "../constants/classroomUrlParams";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { classroomId } = useParams<{ classroomId: string }>();

  const [classroom, setClassroom] = useState<ClassroomDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [createContestOpen, setCreateContestOpen] = useState(false);
  const [viewingAnnouncement, setViewingAnnouncement] =
    useState<ClassroomAnnouncement | null>(null);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] =
    useState<ClassroomAnnouncement | null>(null);

  const isPrivileged =
    classroom?.currentUserRole === "platform_admin" ||
    classroom?.currentUserRole === "owner" ||
    classroom?.currentUserRole === "manager";
  const isMember = Boolean(classroom?.currentUserRole);

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const availablePanels = useMemo<ClassroomAdminPanelId[]>(() => {
    if (isPrivileged) {
      return [
        "overview",
        "announcements",
        "contests",
        "members",
        "settings",
      ];
    }
    if (isMember) {
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
  const shouldReduceMotion = useReducedMotion();
  const prevPanelRef = useRef<ClassroomAdminPanelId>(activePanel);

  useEffect(() => {
    if (prevPanelRef.current === "settings" && activePanel !== "settings") {
      setSettingsModalOpen(false);
    }
    prevPanelRef.current = activePanel;
  }, [activePanel]);

  useEffect(() => {
    if (activePanel === "settings" && isPrivileged) {
      setSettingsModalOpen(true);
    }
  }, [activePanel, isPrivileged]);

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

  const refreshAll = useCallback(async () => {
    await fetchClassroomData();
  }, [fetchClassroomData]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (searchParams.get(CLASSROOM_OPEN_SETTINGS_QUERY) !== "1") return;
    if (loading || !classroom) return;
    const next = new URLSearchParams(searchParams);
    next.delete(CLASSROOM_OPEN_SETTINGS_QUERY);
    setSearchParams(next, { replace: true });
    if (isPrivileged) {
      setSettingsModalOpen(true);
    }
  }, [searchParams, setSearchParams, loading, classroom, isPrivileged]);

  const handleTabChange = ({ selectedIndex }: { selectedIndex: number }) => {
    handleTabChangeIndex(selectedIndex);
  };

  const handleNavigateContest = useCallback(
    (contestId: string) => {
      if (!classroom?.id) return;
      const targetPath = isPrivileged
        ? getClassroomContestAdminPath(classroom.id, contestId)
        : getClassroomContestDashboardPath(classroom.id, contestId);
      navigate(targetPath);
    },
    [classroom?.id, isPrivileged, navigate],
  );

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
      navigate(getClassroomContestAdminPath(targetClassroomId, contestId));
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

  const handleDeleteClassroom = async () => {
    if (!classroom?.id) return;
    try {
      await deleteClassroom(classroom.id);
      showToast({
        kind: "success",
        title: t("classroomDeleted", "教室已刪除"),
      });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroomDeleteFailed", "刪除教室失敗"),
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
        <Button
          kind="tertiary"
          size="sm"
          onClick={() => navigate("/dashboard")}
        >
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
    normalizedDescription.length > 0 &&
    normalizedDescription !== classroom.name.trim();

  return (
    <>
      <ClassroomAdminLayout>
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
            description={
              shouldShowDescription ? normalizedDescription : undefined
            }
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
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activePanel}
                className="classroom-admin-panel__motion"
                initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {activePanel === "overview" && (
                  <OverviewPanel
                    key={`${classroom.id}-${classroom.updatedAt}`}
                    classroom={classroom}
                    isPrivileged={Boolean(isPrivileged)}
                    onCreateAnnouncement={() => {
                      setEditingAnnouncement(null);
                      setAnnouncementModalOpen(true);
                    }}
                    onViewAnnouncement={setViewingAnnouncement}
                    onCreateExam={() => setCreateContestOpen(true)}
                    onNavigateExam={handleNavigateContest}
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
                    description={t(
                      "announcementArchiveSubtitle",
                      "{{count}} 則公告",
                      {
                        count: classroom.announcements.length,
                      },
                    )}
                    groupPinned
                  />
                )}

                {activePanel === "contests" && (
                  <ContestPanel
                    exams={classroom.contests}
                    canBindContests={Boolean(isPrivileged)}
                    onCreateExam={() => setCreateContestOpen(true)}
                    onNavigateExam={handleNavigateContest}
                  />
                )}

                {activePanel === "members" && (
                  <MembersPanel classroom={classroom} />
                )}

                {activePanel === "settings" && (
                  <div
                    className="classroom-admin-panel__settings-placeholder"
                    aria-hidden
                  />
                )}
              </motion.div>
            </AnimatePresence>
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
            onClose={() => {
              setSettingsModalOpen(false);
              if (activePanel === "settings") {
                handlePanelChange("overview");
              }
            }}
            classroom={classroom}
            onRefresh={refreshAll}
            onDeleteClassroom={handleDeleteClassroom}
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

const TAB_CONFIG: Record<
  ClassroomAdminPanelId,
  {
    label: (t: TFn) => string;
    icon: ComponentType<{ size?: number }>;
  }
> = {
  overview: {
    label: (t) => t("sideMenu.overview", "概要"),
    icon: Dashboard,
  },
  announcements: {
    label: (t) => t("sideMenu.announcements", "教室公告"),
    icon: Bullhorn,
  },
  contests: {
    label: (t) => t("sideMenu.contests", "競賽列表"),
    icon: Trophy,
  },
  members: {
    label: (t) => t("sideMenu.members", "教室成員"),
    icon: UserMultiple,
  },
  settings: {
    label: (t) => t("sideMenu.settings", "教室設定"),
    icon: Settings,
  },
};

export default ClassroomDetailScreen;
