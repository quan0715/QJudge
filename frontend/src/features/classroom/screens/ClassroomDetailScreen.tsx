import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Button,
  Tag,
  Modal,
  ClickableTile,
  SkeletonPlaceholder,
  SkeletonText,
  TextInput,
  TextArea,
} from "@carbon/react";
import {
  Add,
  ArrowRight,
  Bullhorn,
  Calendar,
  Education,
  Pin,
  Task,
  Trophy,
  UserMultiple,
} from "@carbon/icons-react";
import type { Classroom, ClassroomAnnouncement, ClassroomDetail, BoundContest } from "@/core/entities/classroom.entity";
import { useToast } from "@/shared/contexts/ToastContext";
import { KpiCard } from "@/shared/ui/dataCard";
import { SettingsPanelRoot, Section, FieldRow } from "@/shared/layout/SettingsPanel";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import {
  getClassroom,
  getClassrooms,
  updateClassroom,
  removeMember,
  regenerateCode,
  bindContest,
  deleteAnnouncement,
} from "@/infrastructure/api/repositories/classroom.repository";
import { InviteCodeDisplay } from "../components/InviteCodeDisplay";
import { MemberTable } from "../components/MemberTable";
import { AddMembersModal } from "../components/AddMembersModal";
import { AnnouncementModal } from "../components/AnnouncementModal";
import CreateContestModal from "@/features/teacher/components/modals/CreateContestModal";
import ClassroomAdminLayout, { type ClassroomAdminPanelId } from "./ClassroomAdminLayout";
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
  const [viewingAnnouncement, setViewingAnnouncement] = useState<ClassroomAnnouncement | null>(null);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<ClassroomAnnouncement | null>(null);

  const isPrivileged =
    classroom?.currentUserRole === "admin" || classroom?.currentUserRole === "teacher";
  const isMember = Boolean(classroom?.currentUserRole);

  const availablePanels = useMemo<ClassroomAdminPanelId[]>(
    () =>
      isPrivileged
        ? ["overview", "announcements", "practice", "contests", "members", "settings"]
        : ["overview", "announcements", "practice", "contests"],
    [isPrivileged],
  );

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

  const handleRemoveMember = async (userId: number) => {
    if (!classroomId) return;
    try {
      await removeMember(classroomId, userId);
      showToast({
        kind: "success",
        title: t("classroom.memberRemoved", "成員已移除"),
      });
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

  const handleRegenerateCode = async () => {
    if (!classroomId) return;
    try {
      await regenerateCode(classroomId);
      showToast({
        kind: "success",
        title: t("classroom.codeRegenerated", "邀請碼已重置"),
      });
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
        onBack={() => navigate("/dashboard")}
        onRefresh={() => {
          void refreshAll();
        }}
      >
        <div className="classroom-admin-page">
          {activePanel === "overview" && (
            <>
              <HeroSection classroom={classroom} />

              <div className="classroom-admin-panel">
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
              </div>
            </>
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

          {activePanel === "practice" && (
            <div className="classroom-admin-panel">
              <PracticePanel
                onOpenBanks={() => navigate("/question-banks")}
                isPrivileged={Boolean(isPrivileged)}
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
                onRegenerateCode={handleRegenerateCode}
                onAddMember={() => setAddMembersOpen(true)}
                onRemoveMember={handleRemoveMember}
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

const HeroSection: React.FC<{ classroom: ClassroomDetail }> = ({ classroom }) => {
  const { t } = useTranslation();
  const normalizedDescription = classroom.description?.trim() ?? "";
  const shouldShowDescription =
    normalizedDescription.length > 0 && normalizedDescription !== classroom.name.trim();

  return (
    <section className="classroom-admin-hero">
      <div className="classroom-admin-hero__body">
        <div className="classroom-admin-hero__main">
          <div className="classroom-admin-hero__top">
            <Education size={24} className="classroom-admin-hero__icon" />
            <h1 className="classroom-admin-hero__title">{classroom.name}</h1>
          </div>

          <div className="classroom-admin-hero__meta">
            <Tag type="blue" size="sm">
              {classroom.currentUserRole || "student"}
            </Tag>
            <Tag type="outline" size="sm">
              {classroom.ownerUsername}
            </Tag>
            {classroom.isArchived && (
              <Tag type="red" size="sm">
                {t("classroom.archived", "已封存")}
              </Tag>
            )}
          </div>

          {shouldShowDescription && (
            <p className="classroom-admin-hero__desc">{normalizedDescription}</p>
          )}

          <div className="classroom-admin-hero__submeta">
            <span>
              <Calendar size={14} />
              {t("classroom.updatedAt", "最後更新")}：
              {new Date(classroom.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="classroom-admin-hero__kpi-strip">
          <KpiCard
            icon={UserMultiple}
            value={String(classroom.memberCount)}
            label={t("classroom.members", "成員")}
            showBorder={false}
          />
          <KpiCard
            icon={Bullhorn}
            value={String(classroom.announcements.length)}
            label={t("classroom.announcements", "公告")}
            showBorder={false}
          />
          <KpiCard
            icon={Trophy}
            value={String(classroom.contests.length)}
            label={t("classroom.contests", "競賽")}
            showBorder={false}
          />
        </div>
      </div>
    </section>
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
        <section className="classroom-admin-section">
          <div className="classroom-admin-section__header">
            <div className="classroom-admin-section__title">
              <Task size={20} />
              <h3>{t("classroom.practice", "練習")}</h3>
            </div>
          </div>
          <p className="classroom-admin-practice__hint">
            {t("classroom.practiceHint", "從這個教室進入練習題，之後會接上題庫練習流。")}
          </p>
          <Button kind="primary" size="sm" onClick={() => onJumpToPanel("practice")}>
            {t("classroom.openPractice", "進入練習")}
          </Button>
        </section>

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
      </div>
    </div>
  );
};

const PracticePanel: React.FC<{
  isPrivileged: boolean;
  onOpenBanks: () => void;
}> = ({ isPrivileged, onOpenBanks }) => {
  const { t } = useTranslation();
  return (
    <section className="classroom-admin-section">
      <div className="classroom-admin-section__header">
        <div className="classroom-admin-section__title">
          <Task size={20} />
          <h3>{t("classroom.practice", "練習")}</h3>
        </div>
      </div>
      <div className="classroom-admin-practice">
        <p className="classroom-admin-practice__hint">
          {t(
            "classroom.practicePanelHint",
            "教室練習入口已建立。下一步可直接串接「我的題庫 / 探索題庫」作為教室練習來源。",
          )}
        </p>
        <Button kind={isPrivileged ? "primary" : "tertiary"} size="sm" onClick={onOpenBanks}>
          {t("classroom.openQuestionBanks", "前往題庫")}
        </Button>
      </div>
    </section>
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
  onRemoveMember: (userId: number) => void;
}> = ({
  classroom,
  isPrivileged,
  onRegenerateCode,
  onAddMember,
  onRemoveMember,
}) => {
  const { t } = useTranslation();
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
        <MemberTable
          members={classroom.members}
          isPrivileged={isPrivileged}
          onRemove={onRemoveMember}
        />
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
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setSettingName(classroom.name);
    setSettingDescription(classroom.description ?? "");
  }, [classroom.name, classroom.description]);

  const isDirty = settingName !== classroom.name || settingDescription !== (classroom.description ?? "");

  const handleSave = async () => {
    setSavingSettings(true);
    try {
      await updateClassroom(classroom.id, {
        name: settingName,
        description: settingDescription,
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
}> = ({ contest, onNavigate }) => (
  <ClickableTile onClick={onNavigate} className="classroom-admin-contest-card">
    <div className="classroom-admin-contest-card__header">
      <h4>{contest.contestName}</h4>
      <Tag type="cyan" size="sm">
        <Trophy size={12} /> Contest
      </Tag>
    </div>
    <div className="classroom-admin-contest-card__meta">
      <Calendar size={14} />
      {new Date(contest.boundAt).toLocaleDateString()}
    </div>
  </ClickableTile>
);

const ContestMiniCard: React.FC<{
  contest: BoundContest;
  onClick: () => void;
}> = ({ contest, onClick }) => (
  <ClickableTile onClick={onClick} className="classroom-admin-mini-card">
    <span>{contest.contestName}</span>
    <ArrowRight size={16} />
  </ClickableTile>
);

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
    <section className="classroom-admin-hero">
      <div className="classroom-admin-hero__body">
        <div className="classroom-admin-hero__main">
          <SkeletonText heading width="45%" />
          <SkeletonText width="65%" />
          <SkeletonText width="55%" />
        </div>
        <div className="classroom-admin-hero__kpi-strip">
          {[1, 2, 3].map((item) => (
            <div key={item} className="classroom-admin-hero__kpi-skeleton">
              <SkeletonPlaceholder style={{ width: 20, height: 20 }} />
              <div style={{ width: "100%" }}>
                <SkeletonText width="35%" />
                <SkeletonText width="65%" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  </div>
);

export default ClassroomDetailScreen;
