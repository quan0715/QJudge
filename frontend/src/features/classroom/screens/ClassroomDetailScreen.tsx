import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import {
  Grid,
  Column,
  Button,
  Tag,
  Modal,
  SkeletonText,
  SkeletonPlaceholder,
  ClickableTile,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from "@carbon/react";
import {
  ArrowLeft,
  Add,
  TrashCan,
  Edit as EditIcon,
  Trophy,
  Bullhorn,
  UserMultiple,
  Calendar,
  Education,
  ArrowRight,
  Pin,
} from "@carbon/icons-react";
import {
  getClassroom,
  removeMember,
  regenerateCode,
  unbindContest,
  deleteAnnouncement,
} from "@/infrastructure/api/repositories/classroom.repository";
import type { ClassroomDetail, ClassroomAnnouncement, BoundContest } from "@/core/entities/classroom.entity";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { InviteCodeDisplay } from "../components/InviteCodeDisplay";
import { MemberTable } from "../components/MemberTable";
import { AddMembersModal } from "../components/AddMembersModal";
import { BindContestModal } from "../components/BindContestModal";
import { AnnouncementModal } from "../components/AnnouncementModal";
import "./ClassroomDetailScreen.scss";

// ── Component ──────────────────────────────────────────

const ClassroomDetailScreen: React.FC = () => {
  const { t } = useTranslation();
  const { classroomId } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();

  const [classroom, setClassroom] = useState<ClassroomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [bindContestOpen, setBindContestOpen] = useState(false);
  const [viewingAnnouncement, setViewingAnnouncement] = useState<ClassroomAnnouncement | null>(null);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<ClassroomAnnouncement | null>(null);

  const isPrivileged =
    classroom?.currentUserRole === "admin" ||
    classroom?.currentUserRole === "teacher";

  const isMember = !!classroom?.currentUserRole;

  const fetchData = useCallback(async () => {
    if (!classroomId) return;
    try {
      setLoading(true);
      const data = await getClassroom(classroomId);
      if (data) setClassroom(data);
    } catch (err) {
      console.error("Failed to fetch classroom", err);
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRemoveMember = async (userId: number) => {
    if (!classroomId) return;
    await removeMember(classroomId, userId);
    fetchData();
  };

  const handleRegenerateCode = async () => {
    if (!classroomId) return;
    await regenerateCode(classroomId);
    fetchData();
  };

  const handleDeleteAnnouncement = async (annId: string) => {
    if (!classroomId) return;
    await deleteAnnouncement(classroomId, annId);
    fetchData();
  };

  const handleUnbindContest = async (contestId: string) => {
    if (!classroomId) return;
    await unbindContest(classroomId, contestId);
    fetchData();
  };

  // ── Skeleton ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="classroom-detail">
        <Grid fullWidth className="classroom-detail__grid">
          <Column lg={16} md={8} sm={4}>
            <div className="classroom-detail__hero">
              <SkeletonText heading width="40%" />
              <SkeletonText width="60%" />
            </div>
            <div className="classroom-detail__stats">
              {[1, 2, 3].map((i) => (
                <div key={i} className="classroom-detail__stat-chip">
                  <SkeletonPlaceholder style={{ width: 48, height: 48 }} />
                </div>
              ))}
            </div>
          </Column>
          <Column lg={10} md={8} sm={4}>
            <SkeletonText heading width="30%" />
            <SkeletonPlaceholder style={{ height: 200 }} />
          </Column>
          <Column lg={6} md={8} sm={4}>
            <SkeletonText heading width="30%" />
            <SkeletonText paragraph lineCount={6} />
          </Column>
        </Grid>
      </div>
    );
  }

  if (!classroom) {
    return (
      <div className="classroom-detail">
        <div className="classroom-detail__empty">
          <Education size={48} className="classroom-detail__empty-icon" />
          <p>{t("classroom.notFound", "找不到教室")}</p>
          <Button kind="tertiary" size="sm" onClick={() => navigate("/classrooms")}>
            {t("common.back", "返回教室列表")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="classroom-detail">
      <Grid fullWidth className="classroom-detail__grid">
        {/* ── Back button ─────────────────────────────── */}
        <Column lg={16} md={8} sm={4}>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ArrowLeft}
            onClick={() => navigate("/classrooms")}
          >
            {t("common.backToClassrooms", "返回教室列表")}
          </Button>
        </Column>

        {/* ── Hero Banner ─────────────────────────────── */}
        <Column lg={16} md={8} sm={4}>
          <div className="classroom-detail__hero">
            <div className="classroom-detail__hero-top">
              <Education size={28} className="classroom-detail__hero-icon" />
              <h1 className="classroom-detail__hero-title">{classroom.name}</h1>
            </div>
            {classroom.description && (
              <p className="classroom-detail__hero-desc">{classroom.description}</p>
            )}
            <div className="classroom-detail__hero-meta">
              <Tag type="blue" size="sm">{classroom.currentUserRole}</Tag>
              <Tag type="outline" size="sm">{classroom.ownerUsername}</Tag>
              {classroom.isArchived && (
                <Tag type="red" size="sm">{t("classroom.archived", "已封存")}</Tag>
              )}
            </div>
          </div>
        </Column>

        {/* ── Stat Chips ──────────────────────────────── */}
        <Column lg={16} md={8} sm={4}>
          <div className="classroom-detail__stats">
            <div className="classroom-detail__stat-chip">
              <UserMultiple size={24} className="classroom-detail__stat-icon" />
              <div>
                <p className="classroom-detail__stat-value">{classroom.memberCount}</p>
                <p className="classroom-detail__stat-label">{t("classroom.members", "成員")}</p>
              </div>
            </div>
            <div className="classroom-detail__stat-chip">
              <Trophy size={24} className="classroom-detail__stat-icon" />
              <div>
                <p className="classroom-detail__stat-value">{classroom.contests.length}</p>
                <p className="classroom-detail__stat-label">{t("classroom.contestCount", "競賽")}</p>
              </div>
            </div>
            <div className="classroom-detail__stat-chip">
              <Bullhorn size={24} className="classroom-detail__stat-icon" />
              <div>
                <p className="classroom-detail__stat-value">{classroom.announcements.length}</p>
                <p className="classroom-detail__stat-label">{t("classroom.announcementCount", "公告")}</p>
              </div>
            </div>
          </div>
        </Column>

        {/* ── Main Content — Tabbed View ──────────────── */}
        <Column lg={16} md={8} sm={4}>
          <Tabs>
            <TabList aria-label="Classroom sections">
              <Tab>{t("classroom.tabOverview", "總覽")}</Tab>
              <Tab>{t("classroom.tabContests", "競賽")}</Tab>
              <Tab>{t("classroom.tabMembers", "成員")}</Tab>
            </TabList>
            <TabPanels>
              {/* ── Tab: 總覽 ──────────────────────────── */}
              <TabPanel>
                <Grid fullWidth>
                  {/* Announcements */}
                  <Column lg={10} md={8} sm={4}>
                    <AnnouncementSection
                      announcements={classroom.announcements}
                      isPrivileged={!!isPrivileged}
                      onCreateClick={() => { setEditingAnnouncement(null); setAnnouncementModalOpen(true); }}
                      onView={setViewingAnnouncement}
                    />
                  </Column>

                  {/* Quick Glance: Contests */}
                  <Column lg={6} md={8} sm={4}>
                    <div className="classroom-detail__section">
                      <div className="classroom-detail__section-header">
                        <div className="classroom-detail__section-title">
                          <Trophy size={20} className="classroom-detail__section-icon" />
                          <h3>{t("classroom.recentContests", "最近競賽")}</h3>
                        </div>
                      </div>
                      {classroom.contests.length === 0 ? (
                        <EmptyBlock icon={Trophy} message={t("classroom.noContests", "尚無競賽")} />
                      ) : (
                        <div style={{ display: "grid", gap: "0.5rem" }}>
                          {classroom.contests.slice(0, 3).map((c) => (
                            <ContestMiniCard
                              key={c.contestId}
                              contest={c}
                              onClick={() => navigate(`/contests/${c.contestId}`)}
                            />
                          ))}
                          {classroom.contests.length > 3 && (
                            <Button
                              kind="ghost"
                              size="sm"
                              renderIcon={ArrowRight}
                              onClick={() => {/* switch to contest tab */}}
                            >
                              {t("classroom.viewAll", "查看全部")} ({classroom.contests.length})
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </Column>
                </Grid>
              </TabPanel>

              {/* ── Tab: 競賽 ──────────────────────────── */}
              <TabPanel>
                <div className="classroom-detail__section">
                  <div className="classroom-detail__section-header">
                    <div className="classroom-detail__section-title">
                      <Trophy size={20} className="classroom-detail__section-icon" />
                      <h3>{t("classroom.contests", "競賽列表")}</h3>
                    </div>
                    {isPrivileged && (
                      <Button
                        kind="ghost"
                        size="sm"
                        renderIcon={Add}
                        onClick={() => setBindContestOpen(true)}
                      >
                        {t("classroom.bindContest", "綁定競賽")}
                      </Button>
                    )}
                  </div>
                  {classroom.contests.length === 0 ? (
                    <EmptyBlock icon={Trophy} message={t("classroom.noContests", "尚未綁定競賽")} />
                  ) : (
                    <div className="classroom-detail__card-grid">
                      {classroom.contests.map((c) => (
                        <ContestCard
                          key={c.contestId}
                          contest={c}
                          isPrivileged={!!isPrivileged}
                          onNavigate={() => navigate(`/contests/${c.contestId}`)}
                          onUnbind={() => handleUnbindContest(c.contestId)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </TabPanel>

              {/* ── Tab: 成員 ──────────────────────────── */}
              <TabPanel>
                {/* Invite Code — 僅 teacher/admin 可見 */}
                {isPrivileged && classroom.inviteCode && (
                  <div className="classroom-detail__invite-inline">
                    <InviteCodeDisplay
                      code={classroom.inviteCode}
                      enabled={classroom.inviteCodeEnabled}
                      onRegenerate={handleRegenerateCode}
                    />
                  </div>
                )}

                <div className="classroom-detail__section">
                  <div className="classroom-detail__section-header">
                    <div className="classroom-detail__section-title">
                      <UserMultiple size={20} className="classroom-detail__section-icon" />
                      <h3>{t("classroom.membersTitle", "成員列表")}</h3>
                    </div>
                    {isPrivileged && (
                      <Button
                        kind="ghost"
                        size="sm"
                        renderIcon={Add}
                        onClick={() => setAddMembersOpen(true)}
                      >
                        {t("classroom.addMembers", "新增成員")}
                      </Button>
                    )}
                  </div>
                  <MemberTable
                    members={classroom.members}
                    isPrivileged={!!isPrivileged}
                    onRemove={handleRemoveMember}
                  />
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Column>
      </Grid>

      {/* ── Modals ────────────────────────────────────── */}
      {isPrivileged && (
        <>
          <AddMembersModal
            open={addMembersOpen}
            classroomId={classroomId!}
            onClose={() => setAddMembersOpen(false)}
            onAdded={() => { setAddMembersOpen(false); fetchData(); }}
          />
          <BindContestModal
            open={bindContestOpen}
            classroomId={classroomId!}
            boundContestIds={classroom.contests.map((c) => c.contestId)}
            onClose={() => setBindContestOpen(false)}
            onBound={() => { setBindContestOpen(false); fetchData(); }}
          />
        </>
      )}

      {/* View announcement modal — all members */}
      <AnnouncementViewModal
        announcement={viewingAnnouncement}
        canEdit={isMember}
        onClose={() => setViewingAnnouncement(null)}
        onEdit={() => {
          setEditingAnnouncement(viewingAnnouncement);
          setViewingAnnouncement(null);
          setAnnouncementModalOpen(true);
        }}
        onDelete={async () => {
          if (viewingAnnouncement && classroomId) {
            await deleteAnnouncement(classroomId, viewingAnnouncement.id);
            setViewingAnnouncement(null);
            fetchData();
          }
        }}
      />

      {/* Edit/Create announcement modal — all members */}
      <AnnouncementModal
        open={announcementModalOpen}
        classroomId={classroomId!}
        announcement={editingAnnouncement}
        onClose={() => setAnnouncementModalOpen(false)}
        onSaved={() => { setAnnouncementModalOpen(false); fetchData(); }}
      />
    </div>
  );
};

// ── Sub-Components ─────────────────────────────────────

/** Contest full card for grid */
const ContestCard: React.FC<{
  contest: BoundContest;
  isPrivileged: boolean;
  onNavigate: () => void;
  onUnbind: () => void;
}> = ({ contest, isPrivileged, onNavigate, onUnbind }) => (
  <ClickableTile onClick={onNavigate} className="classroom-detail__contest-card">
    <div className="classroom-detail__contest-card-header">
      <h4 className="classroom-detail__contest-card-name">{contest.contestName}</h4>
      <Tag type="cyan" size="sm">
        <Trophy size={12} /> Contest
      </Tag>
    </div>
    <div className="classroom-detail__contest-card-meta">
      <span className="classroom-detail__contest-card-meta-item">
        <Calendar size={14} />
        {new Date(contest.boundAt).toLocaleDateString()}
      </span>
    </div>
    {isPrivileged && (
      <Button
        kind="ghost"
        size="sm"
        hasIconOnly
        renderIcon={TrashCan}
        iconDescription="Unbind"
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); onUnbind(); }}
        style={{ position: "absolute", top: "0.5rem", right: "0.5rem" }}
      />
    )}
  </ClickableTile>
);

/** Mini contest card for overview sidebar */
const ContestMiniCard: React.FC<{
  contest: BoundContest;
  onClick: () => void;
}> = ({ contest, onClick }) => (
  <ClickableTile onClick={onClick} style={{ padding: "0.75rem 1rem" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontWeight: 500 }}>{contest.contestName}</span>
      <ArrowRight size={16} style={{ color: "var(--cds-icon-secondary)" }} />
    </div>
  </ClickableTile>
);

/** Announcements section */
const AnnouncementSection: React.FC<{
  announcements: ClassroomAnnouncement[];
  isPrivileged: boolean;
  onCreateClick: () => void;
  onView: (a: ClassroomAnnouncement) => void;
}> = ({ announcements, isPrivileged, onCreateClick, onView }) => {
  const { t } = useTranslation();

  return (
    <div className="classroom-detail__section">
      <div className="classroom-detail__section-header">
        <div className="classroom-detail__section-title">
          <Bullhorn size={20} className="classroom-detail__section-icon" />
          <h3>{t("classroom.announcements", "課程公告")}</h3>
        </div>
        {isPrivileged && (
          <Button kind="ghost" size="sm" renderIcon={Add} onClick={onCreateClick}>
            {t("classroom.createAnnouncement", "發佈公告")}
          </Button>
        )}
      </div>
      {announcements.length === 0 ? (
        <EmptyBlock icon={Bullhorn} message={t("classroom.noAnnouncements", "尚無公告")} />
      ) : (
        <div className="classroom-detail__announcement-list">
          {announcements.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} onClick={() => onView(a)} />
          ))}
        </div>
      )}
    </div>
  );
};

/** Title-only announcement card */
const AnnouncementCard: React.FC<{
  announcement: ClassroomAnnouncement;
  onClick: () => void;
}> = ({ announcement: a, onClick }) => (
  <div
    className={`classroom-detail__ann-card${a.isPinned ? " classroom-detail__ann-card--pinned" : ""}`}
    onClick={onClick}
  >
    <div className="classroom-detail__ann-card-title">
      {a.isPinned && <Pin size={14} className="classroom-detail__ann-card-pin" />}
      <h4>{a.title}</h4>
    </div>
    <div className="classroom-detail__ann-card-meta">
      {a.createdByUsername && (
        <Tag type="high-contrast" size="sm">{a.createdByUsername}</Tag>
      )}
      <span className="classroom-detail__ann-card-date">
        <Calendar size={12} />
        {new Date(a.createdAt).toLocaleDateString()}
      </span>
    </div>
  </div>
);

/** Read-only announcement detail modal */
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
      <div className="classroom-detail__ann-view">
        <div className="classroom-detail__ann-view-meta">
          {announcement.isPinned && (
            <Tag type="red" size="sm"><Pin size={12} /> 置頂</Tag>
          )}
          {announcement.createdByUsername && (
            <Tag type="high-contrast" size="sm">{announcement.createdByUsername}</Tag>
          )}
          <span className="classroom-detail__ann-card-date">
            <Calendar size={12} />
            {new Date(announcement.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div className="classroom-detail__ann-view-body">
          <MarkdownRenderer>{announcement.content}</MarkdownRenderer>
        </div>
      </div>
    </Modal>
  );
};

/** Empty state block */
const EmptyBlock: React.FC<{
  icon: React.ComponentType<{ size: number; className?: string }>;
  message: string;
}> = ({ icon: Icon, message }) => (
  <div className="classroom-detail__empty">
    <Icon size={32} className="classroom-detail__empty-icon" />
    <p>{message}</p>
  </div>
);

export default ClassroomDetailScreen;
