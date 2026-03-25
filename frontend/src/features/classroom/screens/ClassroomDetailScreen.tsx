import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Button,
  Search,
  Select,
  SelectItem,
  Tag,
  Modal,
  ClickableTile,
  SkeletonPlaceholder,
  TextInput,
  TextArea,
} from "@carbon/react";
import {
  Add,
  ArrowRight,
  Bullhorn,
  Calendar,
  CloudUpload,
  Edit,
  Education,
  Pin,
  Task,
  TrashCan,
  Trophy,
  UserMultiple,
} from "@carbon/icons-react";
import type {
  Classroom,
  ClassroomAnnouncement,
  ClassroomDetail,
  BoundContest,
  ClassroomMember,
} from "@/core/entities/classroom.entity";
import type { Contest } from "@/core/entities/contest.entity";
import { useToast } from "@/shared/contexts/ToastContext";
import { SettingsPanelRoot, Section, FieldRow } from "@/shared/layout/SettingsPanel";
import EntityOverviewFrame from "@/shared/layout/EntityOverviewFrame";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import {
  getClassroom,
  getClassrooms,
  updateClassroom,
  removeMember,
  updateMemberRole,
  regenerateCode,
  bindContest,
  deleteAnnouncement,
  uploadClassroomCover,
} from "@/infrastructure/api/repositories/classroom.repository";
import { InviteCodeDisplay } from "../components/InviteCodeDisplay";
import { MemberTable } from "../components/MemberTable";
import { AddMembersModal } from "../components/AddMembersModal";
import { AnnouncementModal } from "../components/AnnouncementModal";
import CreateContestModal from "@/features/teacher/components/modals/CreateContestModal";
import ClassroomAdminLayout, { type ClassroomAdminPanelId } from "./ClassroomAdminLayout";
import { ContestPreviewCard } from "@/features/contest/components/ContestPreviewCard";
import { CLASSROOM_ICON_OPTIONS, getClassroomIcon } from "../constants/classroomIcons";
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

  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [createContestOpen, setCreateContestOpen] = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [pendingMemberRemoval, setPendingMemberRemoval] = useState<ClassroomMember | null>(null);
  const [viewingAnnouncement, setViewingAnnouncement] = useState<ClassroomAnnouncement | null>(null);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<ClassroomAnnouncement | null>(null);

  const isPrivileged =
    classroom?.currentUserRole === "admin" || classroom?.currentUserRole === "teacher";
  const isMember = Boolean(classroom?.currentUserRole);

  const availablePanels = useMemo<ClassroomAdminPanelId[]>(() => {
    if (isPrivileged) {
      return ["overview", "announcements", "contests", "members", "settings"];
    }
    if (isMember) {
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

  const handleClassroomSwitch = (targetId: string) => {
    if (!targetId || targetId === classroomId) return;
    navigate(`/classrooms/${targetId}`);
  };

  const handleRemoveMember = async (member: ClassroomMember) => {
    if (!classroomId) return;
    try {
      await removeMember(classroomId, member.userId);
      showToast({
        kind: "success",
        title: t("classroom.memberRemoved", "成員已移除"),
      });
      setPendingMemberRemoval(null);
      await fetchClassroomData();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.removeMemberFailed", "移除成員失敗"),
        subtitle:
          error instanceof Error
            ? error.message
            : t("classroom.loadFailedHint", "請稍後再試"),
      });
    }
  };

  const handleUpdateMemberRole = async (member: ClassroomMember, role: "student" | "ta") => {
    if (!classroomId) return;
    try {
      await updateMemberRole(classroomId, member.userId, role);
      showToast({
        kind: "success",
        title: t("classroom.memberRoleUpdated", "成員角色已更新"),
      });
      await fetchClassroomData();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.memberRoleUpdateFailed", "更新成員角色失敗"),
        subtitle:
          error instanceof Error
            ? error.message
            : t("classroom.loadFailedHint", "請稍後再試"),
      });
    }
  };

  const handleRegenerateCode = async () => {
    if (!classroomId) return;
    try {
      await regenerateCode(classroomId);
      showToast({
        kind: "success",
        title: t("classroom.codeRegenerated", "邀請碼已重置"),
      });
      setRegenerateConfirmOpen(false);
      await fetchClassroomData();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.codeRegenerateFailed", "重置邀請碼失敗"),
        subtitle:
          error instanceof Error
            ? error.message
            : t("classroom.loadFailedHint", "請稍後再試"),
      });
    }
  };

  const handleCreateContest = async (contestId?: string) => {
    if (!classroomId || !contestId) return;
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

  return (
    <>
      <ClassroomAdminLayout
        classroomName={classroom.name}
        activePanel={activePanel}
        availablePanels={availablePanels}
        classroomOptions={classroomOptions.map((row) => ({ id: row.id, name: row.name }))}
        selectedClassroomId={classroomId || classroom.id}
        onClassroomSwitch={handleClassroomSwitch}
        onPanelChange={handlePanelChange}
        onGoHome={() => navigate("/dashboard")}
        onRefresh={() => {
          void refreshAll();
        }}
      >
        <div className="classroom-admin-page">
          {activePanel === "overview" && (
            <OverviewPanel
              classroom={classroom}
              isPrivileged={Boolean(isPrivileged)}
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
            <div className="classroom-admin-panel">
              <AnnouncementSection
                announcements={classroom.announcements}
                isPrivileged={Boolean(isPrivileged)}
                onCreateClick={() => {
                  setEditingAnnouncement(null);
                  setAnnouncementModalOpen(true);
                }}
                onView={setViewingAnnouncement}
              />
            </div>
          )}

          {activePanel === "contests" && (
            <div className="classroom-admin-panel">
              <ContestPanel
                contests={classroom.contests}
                isPrivileged={Boolean(isPrivileged)}
                onCreateContest={() => setCreateContestOpen(true)}
                onNavigateContest={(contestId) => navigate(`/contests/${contestId}`)}
              />
            </div>
          )}

          {activePanel === "members" && (
            <div className="classroom-admin-panel">
              <MembersPanel
                classroom={classroom}
                isPrivileged={Boolean(isPrivileged)}
                onRegenerateCode={() => setRegenerateConfirmOpen(true)}
                onAddMember={() => setAddMembersOpen(true)}
                onRemoveMember={(member) => setPendingMemberRemoval(member)}
                onUpdateMemberRole={handleUpdateMemberRole}
              />
            </div>
          )}

          {activePanel === "settings" && isPrivileged && (
            <SettingsPanel classroom={classroom} onRefresh={refreshAll} />
          )}

          {activePanel === "settings" && !isPrivileged && (
            <div className="classroom-admin-panel">
              <EmptyBlock icon={Education} message={t("common.noPermission", "你沒有此頁面權限")} />
            </div>
          )}
        </div>
      </ClassroomAdminLayout>

      {isPrivileged && (
        <>
          <AddMembersModal
            open={addMembersOpen}
            classroomId={classroomId || ""}
            onClose={() => setAddMembersOpen(false)}
            onAdded={() => {
              setAddMembersOpen(false);
              void fetchClassroomData();
            }}
          />
          <CreateContestModal
            open={createContestOpen}
            onClose={() => setCreateContestOpen(false)}
            onCreated={(contestId) => {
              void handleCreateContest(contestId);
            }}
          />
        </>
      )}

      <AnnouncementViewModal
        announcement={viewingAnnouncement}
        canEdit={isMember}
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

      <Modal
        open={regenerateConfirmOpen}
        size="sm"
        danger
        modalHeading={t("classroom.confirmRegenerateCodeTitle", "確認重置邀請碼")}
        primaryButtonText={t("common.confirm", "確認")}
        secondaryButtonText={t("common.cancel", "取消")}
        onRequestClose={() => setRegenerateConfirmOpen(false)}
        onRequestSubmit={() => {
          void handleRegenerateCode();
        }}
      >
        <p>
          {t(
            "classroom.confirmRegenerateCodeBody",
            "重置後舊邀請碼會立即失效，尚未加入的學生需改用新邀請碼。",
          )}
        </p>
      </Modal>

      <Modal
        open={Boolean(pendingMemberRemoval)}
        size="sm"
        danger
        modalHeading={t("classroom.confirmRemoveMemberTitle", "確認移除此成員")}
        primaryButtonText={t("classroom.removeMember", "移除成員")}
        secondaryButtonText={t("common.cancel", "取消")}
        onRequestClose={() => setPendingMemberRemoval(null)}
        onRequestSubmit={() => {
          if (pendingMemberRemoval) {
            void handleRemoveMember(pendingMemberRemoval);
          }
        }}
      >
        <p>
          {t("classroom.confirmRemoveMemberBody", "你即將移除此成員：")}{" "}
          <strong>{pendingMemberRemoval?.username}</strong>
        </p>
      </Modal>

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

const DEFAULT_COVER_GRADIENT =
  "linear-gradient(135deg, #1a3a5c 0%, #0f62fe 50%, #4589ff 100%)";

const HeroSection: React.FC<{ classroom: ClassroomDetail }> = ({ classroom }) => {
  const { t } = useTranslation();
  const normalizedDescription = classroom.description?.trim() ?? "";
  const shouldShowDescription =
    normalizedDescription.length > 0 && normalizedDescription !== classroom.name.trim();

  const hasCover = Boolean(classroom.coverUrl);
  const HeroIcon = getClassroomIcon(classroom.icon);

  const wrapperStyle: React.CSSProperties = hasCover
    ? { backgroundImage: `url(${classroom.coverUrl})` }
    : { background: DEFAULT_COVER_GRADIENT };

  return (
    <div className="classroom-hero-wrapper" style={wrapperStyle}>
      {hasCover && <div className="classroom-hero-overlay" />}
      <div className="classroom-hero-content">
        <div className="classroom-hero-left">
          <span className="classroom-hero-icon">
            <HeroIcon size={48} />
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
    </div>
  );
};

const OverviewPanel: React.FC<{
  classroom: ClassroomDetail;
  isPrivileged: boolean;
  onCreateAnnouncement: () => void;
  onViewAnnouncement: (announcement: ClassroomAnnouncement) => void;
  onCreateContest: () => void;
  onNavigateContest: (contestId: string) => void;
  onJumpToPanel: (panel: ClassroomAdminPanelId) => void;
}> = ({
  classroom,
  isPrivileged,
  onCreateAnnouncement,
  onViewAnnouncement,
  onCreateContest,
  onNavigateContest,
  onJumpToPanel,
}) => {
  const { t } = useTranslation();

  return (
    <EntityOverviewFrame
      hero={<HeroSection classroom={classroom} />}
      main={
        <>
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
        </>
      }
      side={
        <>
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
              {isPrivileged && (
                <Button kind="ghost" size="sm" renderIcon={Add} onClick={onCreateContest}>
                  {t("classroom.createContest", "建立競賽")}
                </Button>
              )}
            </div>

            {classroom.contests.length === 0 ? (
              <EmptyBlock
                icon={Trophy}
                message={t("classroom.noContests", "尚未建立競賽")}
                compact
              />
            ) : (
              <div className="classroom-admin-mini-list">
                {classroom.contests.slice(0, 3).map((contest) => (
                  <ContestMiniCard
                    key={contest.contestId}
                    contest={contest}
                    onClick={() => onNavigateContest(contest.contestId)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      }
    />
  );
};

const ContestPanel: React.FC<{
  contests: BoundContest[];
  isPrivileged: boolean;
  onCreateContest: () => void;
  onNavigateContest: (contestId: string) => void;
}> = ({
  contests,
  isPrivileged,
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
        {isPrivileged && (
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

const MembersPanel: React.FC<{
  classroom: ClassroomDetail;
  isPrivileged: boolean;
  onRegenerateCode: () => void;
  onAddMember: () => void;
  onRemoveMember: (member: ClassroomMember) => void;
  onUpdateMemberRole: (member: ClassroomMember, role: "student" | "ta") => void;
}> = ({
  classroom,
  isPrivileged,
  onRegenerateCode,
  onAddMember,
  onRemoveMember,
  onUpdateMemberRole,
}) => {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "student" | "ta">("all");
  const studentCount = useMemo(
    () => classroom.members.filter((member) => member.role === "student").length,
    [classroom.members],
  );
  const taCount = useMemo(
    () => classroom.members.filter((member) => member.role === "ta").length,
    [classroom.members],
  );

  const filteredMembers = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return classroom.members.filter((member) => {
      const roleMatch = roleFilter === "all" || member.role === roleFilter;
      if (!roleMatch) return false;
      if (!normalizedKeyword) return true;
      return (
        member.username.toLowerCase().includes(normalizedKeyword) ||
        member.email.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [classroom.members, keyword, roleFilter]);

  const hasFilter = keyword.trim().length > 0 || roleFilter !== "all";
  return (
    <>
      {isPrivileged && classroom.inviteCode && (
        <section className="classroom-admin-section classroom-admin-section--invite">
          <InviteCodeDisplay
            code={classroom.inviteCode}
            enabled={classroom.inviteCodeEnabled}
            onRegenerate={onRegenerateCode}
          />
        </section>
      )}

      <section className="classroom-admin-section">
        <div className="classroom-admin-section__header">
          <div className="classroom-admin-section__title">
            <UserMultiple size={20} />
            <h3>{t("classroom.membersTitle", "成員列表")}</h3>
          </div>
          {isPrivileged && (
            <Button kind="ghost" size="sm" renderIcon={Add} onClick={onAddMember}>
              {t("classroom.addMembers", "新增成員")}
            </Button>
          )}
        </div>
        <div className="classroom-admin-members-summary">
          <Tag type="teal">{t("classroom.memberTotal", "全部 {{count}} 位", { count: classroom.members.length })}</Tag>
          <Tag type="cool-gray">{t("classroom.memberStudent", "成員 {{count}} 位", { count: studentCount })}</Tag>
          <Tag type="purple">{t("classroom.memberTa", "TA {{count}} 位", { count: taCount })}</Tag>
        </div>
        <div className="classroom-admin-members-toolbar">
          <Search
            id="classroom-member-search"
            labelText={t("classroom.memberSearch", "搜尋成員")}
            placeholder={t("classroom.memberSearchPlaceholder", "搜尋 username 或 email")}
            size="md"
            value={keyword}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setKeyword(event.target.value)}
            className="classroom-admin-members-toolbar__search"
          />
          <Select
            id="classroom-member-role-filter"
            labelText={t("classroom.memberRoleFilter", "角色篩選")}
            hideLabel
            value={roleFilter}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              setRoleFilter(event.target.value as "all" | "student" | "ta")
            }
            size="md"
            className="classroom-admin-members-toolbar__select"
          >
            <SelectItem value="all" text={t("classroom.memberRoleAll", "全部角色")} />
            <SelectItem value="student" text={t("common:user.role.student", "成員")} />
            <SelectItem value="ta" text={t("common:user.role.ta", "TA")} />
          </Select>
          <div className="classroom-admin-members-toolbar__meta">
            <span>
              {t("classroom.memberFilteredCount", "顯示 {{count}} / {{total}} 位", {
                count: filteredMembers.length,
                total: classroom.members.length,
              })}
            </span>
            {hasFilter && (
              <Button
                kind="ghost"
                size="sm"
                onClick={() => {
                  setKeyword("");
                  setRoleFilter("all");
                }}
              >
                {t("common.clearFilter", "清除篩選")}
              </Button>
            )}
          </div>
        </div>
        {filteredMembers.length === 0 ? (
          <EmptyBlock icon={UserMultiple} message={t("classroom.memberNoResult", "找不到符合篩選條件的成員")} compact />
        ) : (
          <MemberTable
            members={filteredMembers}
            isPrivileged={isPrivileged}
            onRemove={onRemoveMember}
            onRoleChange={onUpdateMemberRole}
          />
        )}
      </section>
    </>
  );
};

const SettingsPanel: React.FC<{
  classroom: ClassroomDetail;
  onRefresh: () => Promise<void>;
}> = ({ classroom, onRefresh }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [settingName, setSettingName] = useState(classroom.name);
  const [settingDescription, setSettingDescription] = useState(classroom.description ?? "");
  const [settingIcon, setSettingIcon] = useState(classroom.icon ?? "");
  const [coverPreview, setCoverPreview] = useState(classroom.coverUrl ?? "");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverUrlInput, setCoverUrlInput] = useState("");
  const [coverModalOpen, setCoverModalOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const coverInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSettingName(classroom.name);
    setSettingDescription(classroom.description ?? "");
    setSettingIcon(classroom.icon ?? "");
    setCoverPreview(classroom.coverUrl ?? "");
  }, [classroom.name, classroom.description, classroom.icon, classroom.coverUrl]);

  const isDirty =
    settingName !== classroom.name ||
    settingDescription !== (classroom.description ?? "") ||
    settingIcon !== (classroom.icon ?? "");

  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true);
    try {
      const url = await uploadClassroomCover(classroom.id, file);
      setCoverPreview(url);
      showToast({ kind: "success", title: t("classroom.coverUploaded", "封面圖片已更新") });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.coverUploadFailed", "上傳封面失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleCoverUpload(file);
    e.target.value = "";
  };

  const handleCoverUrlSubmit = async () => {
    const url = coverUrlInput.trim();
    if (!url) return;
    setUploadingCover(true);
    try {
      await updateClassroom(classroom.id, { cover_url: url });
      setCoverPreview(url);
      setCoverUrlInput("");
      showToast({ kind: "success", title: t("classroom.coverUploaded", "封面圖片已更新") });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.coverUploadFailed", "更新封面失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleRemoveCover = async () => {
    setSavingSettings(true);
    try {
      await updateClassroom(classroom.id, { cover_url: "" });
      setCoverPreview("");
      showToast({ kind: "success", title: t("classroom.coverRemoved", "封面圖片已移除") });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.coverRemoveFailed", "移除封面失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSave = async () => {
    setSavingSettings(true);
    try {
      await updateClassroom(classroom.id, {
        name: settingName,
        description: settingDescription,
        icon: settingIcon,
      });
      showToast({
        kind: "success",
        title: t("classroom.settingsSaved", "設定已儲存"),
      });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.settingsSaveFailed", "儲存設定失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <SettingsPanelRoot
      trailing={
        <>
          <Section title={t("classroom.basicInfo", "基本資訊")}>
            <FieldRow label={t("classroom.name", "教室名稱")}>
              <TextInput
                id="classroom-settings-name"
                hideLabel
                labelText={t("classroom.name", "教室名稱")}
                value={settingName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSettingName(e.target.value)}
              />
            </FieldRow>
            <FieldRow label={t("classroom.description", "教室描述")}>
              <TextArea
                id="classroom-settings-description"
                hideLabel
                labelText={t("classroom.description", "教室描述")}
                value={settingDescription}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSettingDescription(e.target.value)}
                rows={4}
              />
            </FieldRow>
            <FieldRow label={t("classroom.icon", "教室圖示")}>
              <div className="classroom-icon-picker">
                {CLASSROOM_ICON_OPTIONS.map((opt) => {
                  const isSelected = settingIcon === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      className={`classroom-icon-picker__item${isSelected ? " classroom-icon-picker__item--active" : ""}`}
                      title={opt.label}
                      onClick={() => setSettingIcon(opt.key)}
                    >
                      <opt.Icon size={20} />
                    </button>
                  );
                })}
              </div>
            </FieldRow>
            <FieldRow label={t("classroom.coverImage", "封面圖片")}>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={handleCoverFileChange}
              />
              <button
                type="button"
                className="classroom-cover-thumb"
                onClick={() => setCoverModalOpen(true)}
              >
                {coverPreview ? (
                  <img src={coverPreview} alt="cover" />
                ) : (
                  <div className="classroom-cover-thumb__empty">
                    <CloudUpload size={20} />
                    <span>{t("classroom.addCover", "新增封面")}</span>
                  </div>
                )}
                <div className="classroom-cover-thumb__overlay">
                  <Edit size={20} />
                </div>
              </button>
            </FieldRow>

            <Modal
              open={coverModalOpen}
              size="sm"
              modalHeading={t("classroom.editCover", "編輯封面圖片")}
              passiveModal
              onRequestClose={() => { setCoverModalOpen(false); setCoverUrlInput(""); }}
            >
              <div className="classroom-cover-modal">
                <Button
                  kind="tertiary"
                  size="md"
                  renderIcon={CloudUpload}
                  disabled={uploadingCover}
                  className="classroom-cover-modal__btn"
                  onClick={() => { coverInputRef.current?.click(); setCoverModalOpen(false); }}
                >
                  {t("classroom.uploadFile", "上傳圖片")}
                </Button>
                <div className="classroom-cover-modal__url-row">
                  <TextInput
                    id="classroom-cover-url-modal"
                    hideLabel
                    labelText="URL"
                    size="md"
                    placeholder="https://images.unsplash.com/..."
                    value={coverUrlInput}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCoverUrlInput(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") { void handleCoverUrlSubmit(); setCoverModalOpen(false); } }}
                  />
                  <Button
                    kind="primary"
                    size="md"
                    disabled={!coverUrlInput.trim() || uploadingCover}
                    onClick={() => { void handleCoverUrlSubmit(); setCoverModalOpen(false); }}
                  >
                    {t("common.apply", "套用")}
                  </Button>
                </div>
                {coverPreview && (
                  <Button
                    kind="danger--ghost"
                    size="md"
                    renderIcon={TrashCan}
                    disabled={uploadingCover || savingSettings}
                    className="classroom-cover-modal__btn"
                    onClick={() => { void handleRemoveCover(); setCoverModalOpen(false); }}
                  >
                    {t("classroom.removeCover", "移除封面")}
                  </Button>
                )}
              </div>
            </Modal>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <Button
                kind="primary"
                size="sm"
                disabled={!isDirty || savingSettings || !settingName.trim()}
                onClick={() => { void handleSave(); }}
              >
                {savingSettings
                  ? t("common.saving", "儲存中…")
                  : t("common.save", "儲存")}
              </Button>
            </div>
          </Section>

          <Section title={t("classroom.otherInfo", "其他資訊")}>
            <FieldRow label={t("classroom.owner", "建立者")}>
              <span style={{ fontSize: "var(--cds-body-long-01-font-size, 0.875rem)" }}>
                {classroom.ownerUsername}
              </span>
            </FieldRow>
            <FieldRow label={t("classroom.createdAt", "建立時間")}>
              <span style={{ fontSize: "var(--cds-body-long-01-font-size, 0.875rem)" }}>
                {new Date(classroom.createdAt).toLocaleString()}
              </span>
            </FieldRow>
            <FieldRow label={t("classroom.updatedAt", "最後更新")}>
              <span style={{ fontSize: "var(--cds-body-long-01-font-size, 0.875rem)" }}>
                {new Date(classroom.updatedAt).toLocaleString()}
              </span>
            </FieldRow>
          </Section>
        </>
      }
    >
      <h2
        style={{
          fontSize: "var(--cds-heading-04-font-size, 1.25rem)",
          fontWeight: 400,
          lineHeight: "1.625rem",
          color: "var(--cds-text-primary)",
          margin: 0,
        }}
      >
        {t("classroom.tab.settings", "教室設定")}
      </h2>
    </SettingsPanelRoot>
  );
};

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

const contestStatusLabel: Record<string, { text: string; type: "blue" | "green" | "gray" }> = {
  draft: { text: "草稿", type: "gray" },
  published: { text: "進行中", type: "green" },
  archived: { text: "已結束", type: "blue" },
};

const ContestMiniCard: React.FC<{
  contest: BoundContest;
  onClick: () => void;
}> = ({ contest, onClick }) => {
  const status = contestStatusLabel[contest.contestStatus] ?? contestStatusLabel.draft;
  const startDate = contest.contestStartTime
    ? new Date(contest.contestStartTime).toLocaleDateString()
    : null;

  return (
    <ClickableTile onClick={onClick} className="classroom-admin-mini-card">
      <div className="classroom-admin-mini-card__info">
        <span className="classroom-admin-mini-card__name">{contest.contestName}</span>
        <span className="classroom-admin-mini-card__meta">
          <Tag type={status.type} size="sm">{status.text}</Tag>
          {startDate && (
            <span className="classroom-admin-mini-card__date">
              <Calendar size={12} />
              {startDate}
            </span>
          )}
        </span>
      </div>
      <ArrowRight size={16} />
    </ClickableTile>
  );
};

const AnnouncementCard: React.FC<{
  announcement: ClassroomAnnouncement;
  onClick: () => void;
}> = ({ announcement, onClick }) => (
  <button
    type="button"
    className={`classroom-admin-announcement-card${
      announcement.isPinned ? " classroom-admin-announcement-card--pinned" : ""
    }`}
    onClick={onClick}
  >
    <div className="classroom-admin-announcement-card__title">
      {announcement.isPinned && <Pin size={14} className="classroom-admin-announcement-card__pin" />}
      <h4>{announcement.title}</h4>
    </div>
    <div className="classroom-admin-announcement-card__meta">
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
  </button>
);

const AnnouncementViewModal: React.FC<{
  announcement: ClassroomAnnouncement | null;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ announcement, canEdit, onClose, onEdit, onDelete }) => {
  if (!announcement) return null;
  return (
    <Modal
      open
      passiveModal={!canEdit}
      onRequestClose={onClose}
      onRequestSubmit={onEdit}
      modalHeading={announcement.title}
      primaryButtonText={canEdit ? "編輯" : undefined}
      secondaryButtonText={canEdit ? "刪除" : undefined}
      onSecondarySubmit={onDelete}
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
    <div className="classroom-hero-wrapper" style={{ minHeight: "12.5rem" }}>
      <SkeletonPlaceholder style={{ width: "100%", height: "100%", position: "absolute" }} />
    </div>
  </div>
);

export default ClassroomDetailScreen;
