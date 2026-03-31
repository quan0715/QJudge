import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Button,
  Search,
  Tag,
  Modal,
  ClickableTile,
  SkeletonPlaceholder,
  SkeletonText,
  Tabs,
  TabList,
  Tab,
} from "@carbon/react";
import {
  Add,
  ArrowRight,
  Bullhorn,
  Calendar,
  Dashboard,
  Education,
  Pin,
  Settings,
  Trophy,
  UserMultiple,
} from "@carbon/icons-react";
import type {
  Classroom,
  ClassroomAnnouncement,
  ClassroomDetail,
  BoundContest,
} from "@/core/entities/classroom.entity";
import type { Contest } from "@/core/entities/contest.entity";
import { getClassroomContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";
import { useToast } from "@/shared/contexts/ToastContext";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { KpiCard } from "@/shared/ui/dataCard";
import {
  getClassroom,
  getClassrooms,
  deleteAnnouncement,
} from "@/infrastructure/api/repositories/classroom.repository";
import { MemberGrid, type MemberCardData } from "../components/MemberTable";
import { AnnouncementModal } from "../components/AnnouncementModal";
import CreateContestModal from "@/features/classroom/components/CreateContestModal";
import ClassroomAdminLayout, { type ClassroomAdminPanelId } from "./ClassroomAdminLayout";
import { QJudgeHeroWidget } from "@/shared/layout/QJudgeHeroWidget";
import { ContestPreviewCard } from "@/features/contest/components/ContestPreviewCard";
import { getClassroomIcon } from "../constants/classroomIcons";
import { ClassroomSettingsModal } from "../components/ClassroomSettingsModal";
import "./ClassroomDetailScreen.scss";

const PANEL_ALIAS: Record<string, ClassroomAdminPanelId> = {
  announcement: "announcements",
  contest: "contests",
  member: "members",
};

const resolveActivePanel = (
  value: string | null,
  availablePanels: ClassroomAdminPanelId[],
): ClassroomAdminPanelId => {
  const normalized = value ? (PANEL_ALIAS[value] ?? value) : "overview";
  return availablePanels.includes(normalized as ClassroomAdminPanelId)
    ? (normalized as ClassroomAdminPanelId)
    : "overview";
};

const ClassroomDetailScreen: React.FC = () => {
  const { t } = useTranslation("classroom");
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { classroomId } = useParams<{ classroomId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

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

  const activePanel = useMemo(
    () => resolveActivePanel(searchParams.get("panel"), availablePanels),
    [searchParams, availablePanels],
  );

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

  useEffect(() => {
    const panelParam = searchParams.get("panel");
    const normalized = resolveActivePanel(panelParam, availablePanels);
    if ((panelParam === null && normalized === "overview") || panelParam === normalized) {
      return;
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (normalized === "overview") {
        next.delete("panel");
      } else {
        next.set("panel", normalized);
      }
      return next;
    });
  }, [availablePanels, searchParams, setSearchParams]);

  const handlePanelChange = (panel: ClassroomAdminPanelId) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (panel === "overview") {
        next.delete("panel");
      } else {
        next.set("panel", panel);
      }
      return next;
    });
  };

  const handleTabChange = ({ selectedIndex }: { selectedIndex: number }) => {
    const panel = availablePanels[selectedIndex];
    if (panel) handlePanelChange(panel);
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

  const selectedTabIndex = availablePanels.indexOf(activePanel);

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



// ── Overview ──

const OverviewPanel: React.FC<{
  classroom: ClassroomDetail;
  isPrivileged: boolean;
  onCreateAnnouncement: () => void;
  onViewAnnouncement: (announcement: ClassroomAnnouncement) => void;
  onCreateExam: () => void;
  onNavigateExam: (contestId: string) => void;
  onJumpToPanel: (panel: ClassroomAdminPanelId) => void;
}> = ({
  classroom,
  isPrivileged,
  onCreateAnnouncement,
  onViewAnnouncement,
  onCreateExam,
  onNavigateExam,
  onJumpToPanel,
}) => {
  const { t } = useTranslation("classroom");
  const activeExams = classroom.contests.filter((row) => row.contestStatus === "published");
  const recentActivities = [...activeExams]
    .sort((left, right) => {
      const leftTime = getActivityTimestamp(left);
      const rightTime = getActivityTimestamp(right);
      return rightTime.localeCompare(leftTime);
    })
    .slice(0, 3);

  return (
    <div className="classroom-admin-overview-layout">
      <div className="classroom-admin-overview-layout__main">
        <AnnouncementSection
          announcements={classroom.announcements.slice(0, 4)}
          isPrivileged={isPrivileged}
          onCreateClick={onCreateAnnouncement}
          onView={onViewAnnouncement}
          compactEmpty
          title={t("latestAnnouncements")}
        />
        {classroom.announcements.length > 4 && (
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ArrowRight}
            onClick={() => onJumpToPanel("announcements")}
          >
            {t("viewAllAnnouncements")}
          </Button>
        )}
      </div>

      <div className="classroom-admin-overview-layout__side">
        {!isPrivileged && (
          <section className="classroom-admin-section classroom-admin-section--todo">
            <div className="classroom-admin-section__header">
              <div className="classroom-admin-section__title">
                <h3>{t("studentTodo", "我的待辦")}</h3>
              </div>
            </div>
            <div className="classroom-admin-todo-list">
              <button type="button" onClick={() => onJumpToPanel("announcements")}>
                <span>{t("announcements")}</span>
                <strong>{classroom.announcements.length}</strong>
              </button>
              <button type="button" onClick={() => onJumpToPanel("contests")}>
                <span>{t("contests", "考試")}</span>
                <strong>{classroom.contests.length}</strong>
              </button>
            </div>
          </section>
        )}

        <section className="classroom-admin-section">
          <div className="classroom-admin-section__header">
            <div className="classroom-admin-section__title">
              <h3>{t("recentActivities", "近期活動")}</h3>
            </div>
            {isPrivileged && (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <Button kind="ghost" size="sm" renderIcon={Add} onClick={onCreateExam}>
                  {t("createContest", "建立考試")}
                </Button>
              </div>
            )}
          </div>

          {recentActivities.length === 0 ? (
            <EmptyBlock
              icon={Trophy}
              message={t("noActiveContests", "目前沒有進行中或即將開始的活動")}
              compact
            />
          ) : (
            <div className="classroom-admin-card-grid">
              {recentActivities.map((activity) => (
                <ContestCard
                  key={activity.contestId}
                  contest={activity}
                  onNavigate={() => onNavigateExam(activity.contestId)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

// ── Contests panel ──

const ContestPanel: React.FC<{
  exams: BoundContest[];
  canBindContests: boolean;
  onCreateExam: () => void;
  onNavigateExam: (contestId: string) => void;
}> = ({
  exams,
  canBindContests,
  onCreateExam,
  onNavigateExam,
}) => {
  const { t } = useTranslation("classroom");

  return (
    <div className="classroom-admin-overview-layout">
      <section className="classroom-admin-section">
        <div className="classroom-admin-section__header">
          <div className="classroom-admin-section__title">
            <h3>{t("contests", "考試與競賽")}</h3>
          </div>
          {canBindContests && (
            <Button kind="ghost" size="sm" renderIcon={Add} onClick={onCreateExam}>
              {t("createContest", "建立考試")}
            </Button>
          )}
        </div>

        {exams.length === 0 ? (
          <EmptyBlock icon={Trophy} message={t("noExamContests", "尚未建立考試或競賽")} />
        ) : (
          <div className="classroom-admin-card-grid">
            {exams.map((contest) => (
              <ContestCard
                key={contest.contestId}
                contest={contest}
                onNavigate={() => onNavigateExam(contest.contestId)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

// ── Members panel ──

const MembersPanel: React.FC<{
  classroom: ClassroomDetail;
}> = ({ classroom }) => {
  const { t } = useTranslation("classroom");
  const [keyword, setKeyword] = useState("");

  const managers: MemberCardData[] = useMemo(() => {
    const owner: MemberCardData = { key: "owner", username: classroom.ownerUsername, role: "owner" };
    const adminCards: MemberCardData[] = classroom.admins
      .filter((a) => a.username !== classroom.ownerUsername)
      .map((a) => ({ key: `admin-${a.id}`, username: a.username, role: "manager" }));
    const taCards: MemberCardData[] = classroom.members
      .filter((m) => m.role === "ta")
      .map((m) => ({ key: `ta-${m.userId}`, username: m.username, email: m.email, avatarUrl: m.avatarUrl, role: "manager" as const }));
    return [owner, ...adminCards, ...taCards];
  }, [classroom.ownerUsername, classroom.admins, classroom.members]);

  const reservedUserIds = useMemo(
    () => new Set(classroom.admins.map((a) => a.id)),
    [classroom.admins],
  );

  const members: MemberCardData[] = useMemo(
    () =>
      classroom.members
        .filter(
          (m) =>
            m.role === "student" &&
            !reservedUserIds.has(m.userId) &&
            m.username !== classroom.ownerUsername,
        )
        .map((m) => ({ key: `student-${m.userId}`, username: m.username, email: m.email, avatarUrl: m.avatarUrl, role: "member" as const })),
    [classroom.members, classroom.ownerUsername, reservedUserIds],
  );

  const filterList = useCallback(
    (list: MemberCardData[]) => {
      const q = keyword.trim().toLowerCase();
      if (!q) return list;
      return list.filter(
        (m) => m.username.toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q),
      );
    },
    [keyword],
  );

  const groups = [
    { key: "manager", label: t("memberGroupTeacher", "教師"), members: filterList(managers) },
    { key: "member", label: t("memberGroupStudent", "學生"), members: filterList(members) },
  ];

  const totalVisible = groups.reduce((sum, g) => sum + g.members.length, 0);

  return (
    <section className="classroom-admin-section">
      <div className="classroom-admin-section__header">
        <div className="classroom-admin-section__title">
          <h3>{t("membersTitle", "成員列表")}</h3>
        </div>
      </div>
      <div className="classroom-admin-member-search">
        <Search
          id="classroom-member-search"
          labelText={t("memberSearch", "搜尋成員")}
          placeholder={t("memberSearchPlaceholder", "搜尋 username 或 email")}
          size="md"
          value={keyword}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setKeyword(event.target.value)}
        />
      </div>
      {totalVisible === 0 ? (
        <EmptyBlock icon={UserMultiple} message={t("memberNoResult", "找不到符合篩選條件的成員")} compact />
      ) : (
        <div className="classroom-admin-member-groups">
          {groups.map((group) =>
            group.members.length > 0 ? (
              <div key={group.key} className="classroom-admin-member-group">
                <h4 className="classroom-admin-member-group__title">{group.label}</h4>
                <MemberGrid members={group.members} />
              </div>
            ) : null,
          )}
        </div>
      )}
    </section>
  );
};

// ── Shared sub-components ──

const AnnouncementSection: React.FC<{
  announcements: ClassroomAnnouncement[];
  isPrivileged: boolean;
  onCreateClick: () => void;
  onView: (announcement: ClassroomAnnouncement) => void;
  compactEmpty?: boolean;
  title?: string;
}> = ({ announcements, isPrivileged, onCreateClick, onView, compactEmpty = false, title }) => {
  const { t } = useTranslation("classroom");
  return (
    <section className="classroom-admin-section">
      <div className="classroom-admin-section__header">
        <div className="classroom-admin-section__title">
          <h3>{title ?? t("announcements")}</h3>
        </div>
        {isPrivileged && (
          <Button kind="ghost" size="sm" renderIcon={Add} onClick={onCreateClick}>
            {t("createAnnouncement")}
          </Button>
        )}
      </div>
      {announcements.length === 0 ? (
        <EmptyBlock
          icon={Bullhorn}
          message={t("noAnnouncements")}
          compact={compactEmpty}
        />
      ) : (
        <div className="classroom-admin-announcement-list">
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              onClick={() => onView(announcement)}
            />
          ))}
        </div>
      )}
    </section>
  );
};

const ContestCard: React.FC<{
  contest: BoundContest;
  onNavigate: () => void;
}> = ({ contest, onNavigate }) => {
  const contestCardData: Contest = {
    id: contest.contestId,
    name: contest.contestName,
    description: contest.contestDescription,
    startTime: contest.contestStartTime || contest.boundAt,
    endTime: contest.contestEndTime || contest.boundAt,
    status: contest.contestStatus,
    visibility: contest.contestVisibility,
    deliveryMode: contest.deliveryMode,
    organizer: undefined,
    hasJoined: true,
    isRegistered: true,
    participantCount: contest.participantCount,
  };

  return <ContestPreviewCard contest={contestCardData} onSelect={onNavigate} />;
};

const getActivityTimestamp = (contest: BoundContest): string =>
  contest.contestStartTime || contest.boundAt;


const stripMarkdown = (md: string, maxLen = 120): string => {
  const plain = md
    .replace(/[#*_~`>\-![\]()]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
};

const AnnouncementCard: React.FC<{
  announcement: ClassroomAnnouncement;
  onClick: () => void;
}> = ({ announcement, onClick }) => {
  const preview = stripMarkdown(announcement.content);

  return (
    <ClickableTile
      onClick={onClick}
      className={`classroom-admin-announcement-card${
        announcement.isPinned ? " classroom-admin-announcement-card--pinned" : ""
      }`}
    >
      <div className="classroom-admin-announcement-card__head">
        {announcement.isPinned && <Pin size={14} className="classroom-admin-announcement-card__pin" />}
        <h4>{announcement.title}</h4>
        <span className="classroom-admin-announcement-card__date">
          <Calendar size={12} />
          {new Date(announcement.createdAt).toLocaleDateString()}
        </span>
      </div>
      {preview && (
        <p className="classroom-admin-announcement-card__preview">{preview}</p>
      )}
    </ClickableTile>
  );
};

const AnnouncementViewModal: React.FC<{
  announcement: ClassroomAnnouncement | null;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ announcement, canEdit, onClose, onEdit, onDelete }) => {
  const { t } = useTranslation("classroom");
  const { t: tc } = useTranslation("common");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  if (!announcement) return null;
  return (
    <>
    <Modal
      open
      passiveModal={!canEdit}
      onRequestClose={onClose}
      onRequestSubmit={onEdit}
      modalHeading={announcement.title}
      primaryButtonText={canEdit ? tc("button.edit") : undefined}
      secondaryButtonText={canEdit ? tc("button.delete") : undefined}
      onSecondarySubmit={() => setConfirmDeleteOpen(true)}
      size="lg"
      danger={false}
    >
      <div className="classroom-admin-announcement-view">
        <div className="classroom-admin-announcement-view__meta">
          {announcement.isPinned && (
            <Tag type="red" size="sm">
              <Pin size={12} /> 置頂
            </Tag>
          )}
          {announcement.createdByUsername && (
            <Tag type="high-contrast" size="sm">
              {announcement.createdByUsername}
            </Tag>
          )}
          <span>
            <Calendar size={12} />
            {new Date(announcement.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div className="classroom-admin-announcement-view__body">
          <MarkdownRenderer>{announcement.content}</MarkdownRenderer>
        </div>
      </div>
    </Modal>

    <Modal
      open={confirmDeleteOpen}
      size="sm"
      danger
      modalHeading={t("confirmDeleteAnnouncementTitle")}
      primaryButtonText={tc("button.delete")}
      secondaryButtonText={tc("button.cancel")}
      onRequestClose={() => setConfirmDeleteOpen(false)}
      onRequestSubmit={() => {
        setConfirmDeleteOpen(false);
        onDelete();
      }}
    >
      <p>
        {t("confirmDeleteAnnouncementBody")}
      </p>
      <p><strong>{announcement.title}</strong></p>
    </Modal>
    </>
  );
};

const EmptyBlock: React.FC<{
  icon: React.ComponentType<{ size: number; className?: string }>;
  message: string;
  compact?: boolean;
}> = ({ icon: Icon, message, compact = false }) => (
  <div className={`classroom-admin-empty-block${compact ? " classroom-admin-empty-block--compact" : ""}`}>
    <Icon size={28} className="classroom-admin-empty-block__icon" />
    <p>{message}</p>
  </div>
);

const ClassroomSkeleton = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      minHeight: "100vh",
      backgroundColor: "var(--cds-background)",
    }}
  >
    <div style={{ minHeight: "12.5rem", position: "relative", overflow: "hidden" }}>
      <SkeletonPlaceholder style={{ width: "100%", height: "12.5rem" }} />
    </div>
    <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <SkeletonText heading width="40%" />
      <SkeletonText width="70%" />
      <SkeletonText width="55%" />
    </div>
  </div>
);

export default ClassroomDetailScreen;
