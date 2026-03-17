import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, ClickableTile, Column, Grid, SkeletonPlaceholder, Stack, Tile } from "@carbon/react";
import { Add, Education, UserMultiple } from "@carbon/icons-react";
import { PageHeader } from "@/shared/layout/PageHeader";
import { createClassroom, getClassrooms } from "@/infrastructure/api/repositories/classroom.repository";
import type { Classroom } from "@/core/entities/classroom.entity";
import type { QuestionBank } from "@/core/entities/question-bank.entity";
import { listMine as listMyQuestionBanks } from "@/infrastructure/api/repositories/questionBank.repository";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useToast } from "@/shared/contexts/ToastContext";
import { JoinClassroomModal } from "@/features/classroom/components/JoinClassroomModal";
import { CreateClassroomModal } from "@/features/classroom/components/CreateClassroomModal";
import "./DashboardScreen.scss";

const CARD_TONES = ["emerald", "indigo", "violet", "orange", "teal", "slate"] as const;

const getTone = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return CARD_TONES[Math.abs(hash) % CARD_TONES.length];
};

const getRoleLabel = (role?: string | null) => {
  if (role === "admin") return "Admin";
  if (role === "teacher") return "Teacher";
  if (role === "ta") return "TA";
  return "Student";
};

const getInitial = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return "C";
  return trimmed.charAt(0).toUpperCase();
};

const DashboardScreen = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [myQuestionBanks, setMyQuestionBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [bankLoading, setBankLoading] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  useEffect(() => {
    let cancelled = false;

    const fetchClassrooms = async () => {
      setLoading(true);
      setBankLoading(isTeacherOrAdmin);
      try {
        const [rows, banks] = await Promise.all([
          getClassrooms(),
          isTeacherOrAdmin ? listMyQuestionBanks() : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setClassrooms(rows);
          setMyQuestionBanks(banks);
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
          setBankLoading(false);
        }
      }
    };

    void fetchClassrooms();
    return () => {
      cancelled = true;
    };
  }, [isTeacherOrAdmin, showToast, t]);

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
        {items.map((classroom) => (
          <ClickableTile
            key={classroom.id}
            className="dashboard-classroom__card"
            onClick={() => navigate(`/classrooms/${classroom.id}`)}
          >
            <div
              className={`dashboard-classroom__card-banner dashboard-classroom__card-banner--${getTone(
                classroom.id
              )}`}
            >
              <span className="dashboard-classroom__card-role">
                {getRoleLabel(classroom.currentUserRole)}
              </span>
              <h4 className="dashboard-classroom__card-title">{classroom.name}</h4>
              <p className="dashboard-classroom__card-owner">{classroom.ownerUsername}</p>
              <div className="dashboard-classroom__card-avatar">{getInitial(classroom.name)}</div>
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
        ))}
      </div>
    );
  };

  const renderQuickClassroomSwitch = () => {
    if (loading) {
      return (
        <div className="dashboard-classroom__quick-list">
          {Array.from({ length: 5 }).map((_, idx) => (
            <SkeletonPlaceholder key={idx} className="dashboard-classroom__quick-skeleton" />
          ))}
        </div>
      );
    }

    if (orderedClassrooms.length === 0) {
      return (
        <div className="dashboard-classroom__quick-empty">
          <p>{t("dashboard.classroomHub.quickEmpty", "尚無可切換教室")}</p>
          <Button kind="ghost" onClick={() => setJoinOpen(true)}>
            {t("classroom.join", "加入教室")}
          </Button>
        </div>
      );
    }

    return (
      <div className="dashboard-classroom__quick-list">
        {orderedClassrooms.slice(0, 8).map((classroom) => (
          <button
            key={classroom.id}
            type="button"
            className="dashboard-classroom__quick-item"
            onClick={() => navigate(`/classrooms/${classroom.id}`)}
          >
            <span className="dashboard-classroom__quick-item-name">{classroom.name}</span>
            <span className="dashboard-classroom__quick-item-meta">
              {getRoleLabel(classroom.currentUserRole)} · {classroom.memberCount}
            </span>
          </button>
        ))}
      </div>
    );
  };

  const renderQuestionBankList = () => {
    if (bankLoading) {
      return (
        <div className="dashboard-classroom__bank-list">
          {Array.from({ length: 4 }).map((_, idx) => (
            <SkeletonPlaceholder key={idx} className="dashboard-classroom__quick-skeleton" />
          ))}
        </div>
      );
    }

    if (myQuestionBanks.length === 0) {
      return (
        <div className="dashboard-classroom__bank-empty">
          <p>{t("questionBank.emptyMine", "尚無題庫")}</p>
          <Button kind="ghost" onClick={() => navigate("/question-banks")}>
            {t("questionBank.createFirst", "前往建立題庫")}
          </Button>
        </div>
      );
    }

    return (
      <div className="dashboard-classroom__bank-list">
        {myQuestionBanks.map((bank) => (
          <button
            key={bank.id}
            type="button"
            className="dashboard-classroom__bank-item"
            onClick={() => navigate(`/question-banks/${bank.id}`)}
          >
            <span className="dashboard-classroom__quick-item-name">{bank.name}</span>
            <span className="dashboard-classroom__quick-item-meta">
              {bank.category} · {bank.questionCount}
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="dashboard-classroom">
      <div className="dashboard-classroom__shell">
        <aside className="dashboard-classroom__sidenav" aria-label={t("nav.dashboard", "Dashboard")}>
          <div className="dashboard-classroom__sidenav-section">
            <p className="dashboard-classroom__sidenav-title">
              {t("dashboard.classroomHub.switchTitle", "教室")}
            </p>
            {renderQuickClassroomSwitch()}
          </div>

          {isTeacherOrAdmin ? (
            <div className="dashboard-classroom__sidenav-section">
              <p className="dashboard-classroom__sidenav-title">
                {t("dashboard.classroomHub.bankTitle", "題庫")}
              </p>
              {renderQuestionBankList()}
            </div>
          ) : null}

          <div className="dashboard-classroom__sidenav-bottom">
            <button
              type="button"
              className="dashboard-classroom__sidenav-link"
              onClick={() => navigate("/settings")}
            >
              {t("nav.settings", "設定")}
            </button>
          </div>
        </aside>

        <section className="dashboard-classroom__main">
          <Grid fullWidth className="dashboard-classroom__layout">
            <Column lg={16} md={8} sm={4}>
              <PageHeader
                title={t("dashboard.classroomHub.selectTitle", "先選擇教室")}
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
      </div>

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
