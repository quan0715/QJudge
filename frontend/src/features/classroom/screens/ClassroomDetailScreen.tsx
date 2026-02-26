import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import {
  Grid,
  Column,
  Button,
  Tag,
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
  Trophy,
  Bullhorn,
  UserMultiple,
  Calendar,
  Education,
  ArrowRight,
  WarningAlt,
} from "@carbon/icons-react";
import {
  getClassroom,
  removeMember,
  regenerateCode,
  unbindContest,
} from "@/infrastructure/api/repositories/classroom.repository";
import type { ClassroomDetail, BoundContest } from "@/core/entities/classroom.entity";
import { InviteCodeDisplay } from "../components/InviteCodeDisplay";
import { MemberTable } from "../components/MemberTable";
import { AddMembersModal } from "../components/AddMembersModal";
import { BindContestModal } from "../components/BindContestModal";
import "./ClassroomDetailScreen.scss";

// ── Mock Data (課程公告 — 尚無 data model) ─────────────
interface ClassroomAnnouncement {
  id: string;
  title: string;
  body: string;
  date: string;
  important: boolean;
}

const MOCK_ANNOUNCEMENTS: ClassroomAnnouncement[] = [
  {
    id: "1",
    title: "期中考範圍公告",
    body: "期中考涵蓋 Week 1 ~ Week 7 內容，包含 Stack、Queue、Tree 基本操作。考試時間 90 分鐘，可攜帶一張 A4 筆記。",
    date: "2026-02-25",
    important: true,
  },
  {
    id: "2",
    title: "作業 3 截止日延期",
    body: "因應同學反映，作業 3 截止日延期至 3/5（三）23:59。請把握時間完成。",
    date: "2026-02-22",
    important: false,
  },
  {
    id: "3",
    title: "助教 Office Hours 時間調整",
    body: "本週起助教 Office Hours 改為每週二 14:00-16:00、每週四 15:00-17:00，地點不變（EC-322）。",
    date: "2026-02-20",
    important: false,
  },
  {
    id: "4",
    title: "歡迎加入本課程",
    body: "請確認已完成選課並加入 QJudge 教室。若有帳號問題請聯繫助教。",
    date: "2026-02-10",
    important: false,
  },
];

// ── Component ──────────────────────────────────────────

const ClassroomDetailScreen: React.FC = () => {
  const { t } = useTranslation();
  const { classroomId } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();

  const [classroom, setClassroom] = useState<ClassroomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [bindContestOpen, setBindContestOpen] = useState(false);

  const isPrivileged =
    classroom?.currentUserRole === "admin" ||
    classroom?.currentUserRole === "teacher";

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
                <p className="classroom-detail__stat-value">{MOCK_ANNOUNCEMENTS.length}</p>
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
                    <AnnouncementSection announcements={MOCK_ANNOUNCEMENTS} />
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

/** Announcements section with mock data */
const AnnouncementSection: React.FC<{
  announcements: ClassroomAnnouncement[];
}> = ({ announcements }) => {
  const { t } = useTranslation();
  return (
    <div className="classroom-detail__section">
      <div className="classroom-detail__section-header">
        <div className="classroom-detail__section-title">
          <Bullhorn size={20} className="classroom-detail__section-icon" />
          <h3>{t("classroom.announcements", "課程公告")}</h3>
        </div>
        <Tag type="gray" size="sm">{t("classroom.mockData", "模擬資料")}</Tag>
      </div>
      {announcements.map((a) => (
        <div key={a.id} className="classroom-detail__announcement">
          <div
            className={`classroom-detail__announcement-marker${
              a.important ? " classroom-detail__announcement-marker--warning" : ""
            }`}
          />
          <div className="classroom-detail__announcement-content">
            <p className="classroom-detail__announcement-title">
              {a.important && <WarningAlt size={14} style={{ marginRight: 4, color: "var(--cds-support-warning)" }} />}
              {a.title}
            </p>
            <p className="classroom-detail__announcement-body">{a.body}</p>
            <p className="classroom-detail__announcement-date">{a.date}</p>
          </div>
        </div>
      ))}
    </div>
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
