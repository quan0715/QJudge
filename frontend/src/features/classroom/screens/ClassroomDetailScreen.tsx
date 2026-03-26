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
  Task,
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
import { useToast } from "@/shared/contexts/ToastContext";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import {
  getClassroom,
  getClassrooms,
  bindContest,
  deleteAnnouncement,
} from "@/infrastructure/api/repositories/classroom.repository";
import { MemberGrid, type MemberCardData } from "../components/MemberTable";
import { AnnouncementModal } from "../components/AnnouncementModal";
import CreateContestModal from "@/features/classroom/components/CreateContestModal";
import ClassroomAdminLayout, { type ClassroomAdminPanelId } from "./ClassroomAdminLayout";
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
  const { t } = useTranslation();
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
  const canBindContests = classroom?.currentUserRole === "platform_admin";
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
          title: t("classroom.notFound", "找不到教室"),
        });
        return;
      }
      setClassroom(data);
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.loadFailed", "載入教室失敗"),
        subtitle:
          error instanceof Error
            ? error.message
            : t("classroom.loadFailedHint", "請稍後再試"),
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
        title: t("classroom.switcherLoadFailed", "載入教室清單失敗"),
        subtitle:
          error instanceof Error
            ? error.message
            : t("classroom.loadFailedHint", "請稍後再試"),
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
    if (!classroomId || !contestId) return;
    if (!canBindContests) {
      showToast({
        kind: "error",
        title: t("classroom.bindContestNoPermission", "你沒有綁定競賽的權限"),
      });
      return;
    }
    try {
      await bindContest(classroomId, contestId);
      showToast({
        kind: "success",
        title: t("classroom.createContestSuccess", "已建立競賽並加入教室"),
      });
      setCreateContestOpen(false);
      await fetchClassroomData();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.createContestFailed", "建立競賽成功但加入教室失敗"),
        subtitle:
          error instanceof Error
            ? error.message
            : t("classroom.loadFailedHint", "請稍後再試"),
      });
    }
  };

  const handleDeleteAnnouncement = async () => {
    if (!classroomId) return;
    try {
      if (!viewingAnnouncement) return;
      await deleteAnnouncement(classroomId, viewingAnnouncement.id);
      showToast({
        kind: "success",
        title: t("classroom.announcementDeleted", "公告已刪除"),
      });
      setViewingAnnouncement(null);
      await fetchClassroomData();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.announcementDeleteFailed", "刪除公告失敗"),
        subtitle:
          error instanceof Error
            ? error.message
            : t("classroom.loadFailedHint", "請稍後再試"),
      });
    }
  };

  if (loading && !classroom) return <ClassroomSkeleton />;

  if (!classroom) {
    return (
      <div className="classroom-admin-empty">
        <Education size={48} className="classroom-admin-empty__icon" />
        <p>{t("classroom.notFound", "找不到教室")}</p>
        <Button kind="tertiary" size="sm" onClick={() => navigate("/dashboard")}>
          {t("common.backToClassrooms", "返回教室列表")}
        </Button>
      </div>
    );
  }

  const selectedTabIndex = availablePanels.indexOf(activePanel);

  return (
    <>
      <ClassroomAdminLayout
        classroomName={classroom.name}
        classroomOptions={classroomOptions.map((row) => ({ id: row.id, name: row.name }))}
        selectedClassroomId={classroomId || classroom.id}
        onClassroomSwitch={handleClassroomSwitch}
        onGoHome={() => navigate("/dashboard")}
        onOpenSettings={isPrivileged ? () => setSettingsModalOpen(true) : undefined}
      >
        <div className="classroom-admin-page">
          <div className="classroom-hero-and-tabs" style={getHeroStyle(classroom)}>
            {Boolean(classroom.coverUrl) && <div className="classroom-hero-overlay" />}
            <HeroSection classroom={classroom} />
            <div className="classroom-tabs-bar">
              <Tabs
                selectedIndex={selectedTabIndex >= 0 ? selectedTabIndex : 0}
                onChange={handleTabChange}
              >
                <TabList aria-label={t("classroom.tabs", "教室分頁")}>
                  {availablePanels.map((panel) => (
                    <Tab key={panel} renderIcon={TAB_CONFIG[panel]?.icon}>
                      {TAB_CONFIG[panel]?.label(t) ?? panel}
                    </Tab>
                  ))}
                </TabList>
              </Tabs>
            </div>
          </div>

          <div className="classroom-admin-panel">
            {activePanel === "overview" && (
              <OverviewPanel
                classroom={classroom}
                isPrivileged={Boolean(isPrivileged)}
                canBindContests={Boolean(canBindContests)}
                onCreateAnnouncement={() => {
                  setEditingAnnouncement(null);
                  setAnnouncementModalOpen(true);
                }}
                onViewAnnouncement={setViewingAnnouncement}
                onCreateContest={() => setCreateContestOpen(true)}
                onNavigateContest={(contestId) => navigate(`/contests/${contestId}`)}
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
                contests={classroom.contests}
                canBindContests={Boolean(canBindContests)}
                onCreateContest={() => setCreateContestOpen(true)}
                onNavigateContest={(contestId) => navigate(`/contests/${contestId}`)}
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
          {canBindContests && (
            <CreateContestModal
              open={createContestOpen}
              onClose={() => setCreateContestOpen(false)}
              onCreated={(contestId) => {
                void handleCreateContest(contestId);
              }}
            />
          )}
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

const TAB_CONFIG: Record<ClassroomAdminPanelId, { label: (t: TFn) => string; icon: React.ComponentType }> = {
  overview:      { label: (t) => t("classroom.tab.overview", "Overview"),  icon: Dashboard },
  announcements: { label: (t) => t("classroom.announcements", "公告"),     icon: Bullhorn },
  contests:      { label: (t) => t("classroom.contests", "競賽"),          icon: Trophy },
  members:       { label: (t) => t("classroom.members", "成員"),           icon: UserMultiple },
  settings:      { label: (t) => t("classroom.tab.settings", "設定"),      icon: Settings },
};

// ── Hero ──

const DEFAULT_COVER_GRADIENT =
  "linear-gradient(135deg, #1a3a5c 0%, #0f62fe 50%, #4589ff 100%)";

const getHeroStyle = (classroom: ClassroomDetail): React.CSSProperties => {
  const hasCover = Boolean(classroom.coverUrl);
  return hasCover
    ? { backgroundImage: `url(${classroom.coverUrl})` }
    : { background: DEFAULT_COVER_GRADIENT };
};

const HeroSection: React.FC<{ classroom: ClassroomDetail }> = ({ classroom }) => {
  const { t } = useTranslation();
  const normalizedDescription = classroom.description?.trim() ?? "";
  const shouldShowDescription =
    normalizedDescription.length > 0 && normalizedDescription !== classroom.name.trim();

  const HeroIcon = getClassroomIcon(classroom.icon);

  return (
    <div className="classroom-hero-content">
      <div className="classroom-hero-left">
        <span className="classroom-hero-icon">
          <HeroIcon size={32} />
        </span>
        <h1 className="classroom-hero-title">
          {classroom.name}
          {classroom.isArchived && (
            <Tag type="red" size="sm">
              {t("classroom.archived", "已封存")}
            </Tag>
          )}
        </h1>
        {shouldShowDescription && (
          <p className="classroom-hero-desc">{normalizedDescription}</p>
        )}
      </div>
    </div>
  );
};

// ── Overview ──

const OverviewPanel: React.FC<{
  classroom: ClassroomDetail;
  isPrivileged: boolean;
  canBindContests: boolean;
  onCreateAnnouncement: () => void;
  onViewAnnouncement: (announcement: ClassroomAnnouncement) => void;
  onCreateContest: () => void;
  onNavigateContest: (contestId: string) => void;
  onJumpToPanel: (panel: ClassroomAdminPanelId) => void;
}> = ({
  classroom,
  isPrivileged,
  canBindContests,
  onCreateAnnouncement,
  onViewAnnouncement,
  onCreateContest,
  onNavigateContest,
  onJumpToPanel,
}) => {
  const { t } = useTranslation();

  return (
    <div className="classroom-admin-overview-layout">
      <div className="classroom-admin-overview-layout__main">
        <AnnouncementSection
          announcements={classroom.announcements.slice(0, 4)}
          isPrivileged={isPrivileged}
          onCreateClick={onCreateAnnouncement}
          onView={onViewAnnouncement}
          compactEmpty
        />
        {classroom.announcements.length > 4 && (
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ArrowRight}
            onClick={() => onJumpToPanel("announcements")}
          >
            {t("classroom.viewAllAnnouncements", "查看全部公告")}
          </Button>
        )}
      </div>

      <div className="classroom-admin-overview-layout__side">
        {!isPrivileged && (
          <section className="classroom-admin-section classroom-admin-section--todo">
            <div className="classroom-admin-section__header">
              <div className="classroom-admin-section__title">
                <Task size={20} />
                <h3>{t("classroom.studentTodo", "我的待辦")}</h3>
              </div>
            </div>
            <div className="classroom-admin-todo-list">
              <button type="button" onClick={() => onJumpToPanel("announcements")}>
                <span>{t("classroom.announcements", "公告")}</span>
                <strong>{classroom.announcements.length}</strong>
              </button>
              <button type="button" onClick={() => onJumpToPanel("contests")}>
                <span>{t("classroom.contests", "競賽")}</span>
                <strong>{classroom.contests.length}</strong>
              </button>
            </div>
          </section>
        )}

        <section className="classroom-admin-section">
          <div className="classroom-admin-section__header">
            <div className="classroom-admin-section__title">
              <Trophy size={20} />
              <h3>{t("classroom.contests", "競賽")}</h3>
            </div>
            {canBindContests && (
              <Button kind="ghost" size="sm" renderIcon={Add} onClick={onCreateContest}>
                {t("classroom.createContest", "建立競賽")}
              </Button>
            )}
          </div>

          {(() => {
            const active = classroom.contests.filter((c) => c.contestStatus === "published");
            return active.length === 0 ? (
              <EmptyBlock
                icon={Trophy}
                message={t("classroom.noActiveContests", "目前沒有進行中或即將開始的競賽")}
                compact
              />
            ) : (
              <div className="classroom-admin-card-grid">
                {active.slice(0, 3).map((contest) => (
                  <ContestCard
                    key={contest.contestId}
                    contest={contest}
                    onNavigate={() => onNavigateContest(contest.contestId)}
                  />
                ))}
              </div>
            );
          })()}
        </section>
      </div>
    </div>
  );
};

// ── Contests panel ──

const ContestPanel: React.FC<{
  contests: BoundContest[];
  canBindContests: boolean;
  onCreateContest: () => void;
  onNavigateContest: (contestId: string) => void;
}> = ({
  contests,
  canBindContests,
  onCreateContest,
  onNavigateContest,
}) => {
  const { t } = useTranslation();

  return (
    <section className="classroom-admin-section">
      <div className="classroom-admin-section__header">
        <div className="classroom-admin-section__title">
          <Trophy size={20} />
          <h3>{t("classroom.contests", "競賽列表")}</h3>
        </div>
        {canBindContests && (
          <Button kind="ghost" size="sm" renderIcon={Add} onClick={onCreateContest}>
            {t("classroom.createContest", "建立競賽")}
          </Button>
        )}
      </div>

      {contests.length === 0 ? (
        <EmptyBlock icon={Trophy} message={t("classroom.noContests", "尚未建立競賽")} />
      ) : (
        <div className="classroom-admin-card-grid">
          {contests.map((contest) => (
            <ContestCard
              key={contest.contestId}
              contest={contest}
              onNavigate={() => onNavigateContest(contest.contestId)}
            />
          ))}
        </div>
      )}
    </section>
  );
};

// ── Members panel ──

const MembersPanel: React.FC<{
  classroom: ClassroomDetail;
}> = ({ classroom }) => {
  const { t } = useTranslation();
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

  const members: MemberCardData[] = useMemo(
    () =>
      classroom.members
        .filter((m) => m.role === "student")
        .map((m) => ({ key: `student-${m.userId}`, username: m.username, email: m.email, avatarUrl: m.avatarUrl, role: "member" as const })),
    [classroom.members],
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
    { key: "manager", label: t("classroom.memberGroupTeacher", "教師"), members: filterList(managers) },
    { key: "member", label: t("classroom.memberGroupStudent", "學生"), members: filterList(members) },
  ];

  const totalVisible = groups.reduce((sum, g) => sum + g.members.length, 0);

  return (
    <section className="classroom-admin-section">
      <div className="classroom-admin-section__header">
        <div className="classroom-admin-section__title">
          <UserMultiple size={20} />
          <h3>{t("classroom.membersTitle", "成員列表")}</h3>
        </div>
      </div>
      <div className="classroom-admin-member-search">
        <Search
          id="classroom-member-search"
          labelText={t("classroom.memberSearch", "搜尋成員")}
          placeholder={t("classroom.memberSearchPlaceholder", "搜尋 username 或 email")}
          size="md"
          value={keyword}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setKeyword(event.target.value)}
        />
      </div>
      {totalVisible === 0 ? (
        <EmptyBlock icon={UserMultiple} message={t("classroom.memberNoResult", "找不到符合篩選條件的成員")} compact />
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
}> = ({ announcements, isPrivileged, onCreateClick, onView, compactEmpty = false }) => {
  const { t } = useTranslation();
  return (
    <section className="classroom-admin-section">
      <div className="classroom-admin-section__header">
        <div className="classroom-admin-section__title">
          <Bullhorn size={20} />
          <h3>{t("classroom.announcements", "課程公告")}</h3>
        </div>
        {isPrivileged && (
          <Button kind="ghost" size="sm" renderIcon={Add} onClick={onCreateClick}>
            {t("classroom.createAnnouncement", "發佈公告")}
          </Button>
        )}
      </div>
      {announcements.length === 0 ? (
        <EmptyBlock
          icon={Bullhorn}
          message={t("classroom.noAnnouncements", "尚無公告")}
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
    description: "",
    startTime: contest.contestStartTime || contest.boundAt,
    endTime: contest.contestEndTime || contest.boundAt,
    status: contest.contestStatus,
    visibility: contest.contestVisibility,
    organizer: contest.contestOwnerUsername || undefined,
    hasJoined: true,
    isRegistered: true,
    participantCount: contest.participantCount,
  };

  return <ContestPreviewCard contest={contestCardData} onSelect={onNavigate} />;
};


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
    <button
      type="button"
      className={`classroom-admin-announcement-card${
        announcement.isPinned ? " classroom-admin-announcement-card--pinned" : ""
      }`}
      onClick={onClick}
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
    </button>
  );
};

const AnnouncementViewModal: React.FC<{
  announcement: ClassroomAnnouncement | null;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ announcement, canEdit, onClose, onEdit, onDelete }) => {
  const { t } = useTranslation();
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
      primaryButtonText={canEdit ? t("common.edit", "Edit") : undefined}
      secondaryButtonText={canEdit ? t("common.delete", "Delete") : undefined}
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
      modalHeading={t("classroom.confirmDeleteAnnouncementTitle", "Confirm delete announcement")}
      primaryButtonText={t("common.delete", "Delete")}
      secondaryButtonText={t("common.cancel", "Cancel")}
      onRequestClose={() => setConfirmDeleteOpen(false)}
      onRequestSubmit={() => {
        setConfirmDeleteOpen(false);
        onDelete();
      }}
    >
      <p>
        {t(
          "classroom.confirmDeleteAnnouncementBody",
          "Are you sure to delete this announcement? This action cannot be undone.",
        )}
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
  <div className="classroom-admin-page">
    <div className="classroom-hero-and-tabs" style={{ minHeight: "12.5rem", background: DEFAULT_COVER_GRADIENT }}>
      <SkeletonPlaceholder style={{ width: "100%", height: "100%", position: "absolute" }} />
    </div>
  </div>
);

export default ClassroomDetailScreen;
