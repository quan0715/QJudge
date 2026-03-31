import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, ClickableTile, MenuButton, MenuItem, SkeletonPlaceholder, Tile } from "@carbon/react";
import { Education, UserMultiple, Catalog } from "@carbon/icons-react";
import { KpiCard } from "@/shared/ui/dataCard/KpiCard";
import { getClassroomIcon } from "@/features/classroom/constants/classroomIcons";
import { createClassroom, getClassrooms } from "@/infrastructure/api/repositories/classroom.repository";
import { listMine } from "@/infrastructure/api/repositories/questionBank.repository";
import type { Classroom } from "@/core/entities/classroom.entity";
import type { QuestionBank } from "@/core/entities/question-bank.entity";
import { BankGalleryCard } from "@/features/question-banks/components/BankGalleryCard";
import { CreateBankModal } from "@/features/question-banks/components/CreateBankModal";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useToast } from "@/shared/contexts/ToastContext";
import { CreateClassroomModal } from "@/features/classroom/components/CreateClassroomModal";
import { QJudgeHeroWidget } from "@/shared/layout/QJudgeHeroWidget";
import "./DashboardScreen.scss";

const CLASSROOM_BANNER_IMAGES = [
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80",
] as const;

const hashValue = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getClassroomBannerImage = (id: string) =>
  CLASSROOM_BANNER_IMAGES[hashValue(id) % CLASSROOM_BANNER_IMAGES.length];

const DEFAULT_BANK_CARDS = 8;

const DashboardScreen = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [banksLoading, setBanksLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [bankCreateOpen, setBankCreateOpen] = useState(false);
  const [showAllBanks, setShowAllBanks] = useState(false);

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";
  const welcomeName = user?.profile?.display_name?.trim() || user?.username || t("common.user", "使用者");

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      if (isTeacherOrAdmin) setBanksLoading(true);

      const results = await Promise.allSettled([
        getClassrooms(),
        isTeacherOrAdmin ? listMine() : Promise.resolve([]),
      ]);

      if (cancelled) return;

      const [classroomResult, bankResult] = results;

      if (classroomResult.status === "fulfilled") {
        setClassrooms(classroomResult.value);
      } else {
        showToast({
          kind: "error",
          title: t("dashboard.classroomHub.loadFailed", "載入教室失敗"),
          subtitle: t("dashboard.classroomHub.loadFailedHint", "請稍後再試"),
        });
      }

      if (bankResult.status === "fulfilled") {
        setQuestionBanks(bankResult.value);
      }

      setLoading(false);
      setBanksLoading(false);
    };

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [showToast, t, isTeacherOrAdmin]);

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
    const rank: Record<string, number> = {
      platform_admin: 0,
      owner: 1,
      manager: 2,
      member: 3,
    };
    return [...classrooms].sort((a, b) => {
      const ra = rank[a.currentUserRole ?? "member"] ?? 99;
      const rb = rank[b.currentUserRole ?? "member"] ?? 99;
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
              <p>{t("dashboard.classroomHub.emptyDesc", "先建立教室或透過邀請連結加入教室。")}</p>
            </div>
          </div>
        </Tile>
      );
    }

    return (
      <div className="dashboard-classroom__grid">
        {items.map((classroom) => {
          const bannerImage = classroom.coverUrl || getClassroomBannerImage(classroom.id);
          const CardIcon = getClassroomIcon(classroom.icon);
          return (
            <ClickableTile
              key={classroom.id}
              className="dashboard-classroom__card"
              onClick={() => navigate(`/classrooms/${classroom.id}`)}
            >
              <div
                className="dashboard-classroom__card-banner"
                style={{
                  backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 65%), url(${bannerImage})`,
                }}
              >
                <h4 className="dashboard-classroom__card-title">{classroom.name}</h4>
                <div className="dashboard-classroom__card-avatar">
                  <CardIcon size={20} />
                </div>
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

              {/* Mobile mini view */}
              <div className="dashboard-classroom__card-mini-body">
                <div className="dashboard-classroom__card-mini-icon">
                  <CardIcon size={16} />
                </div>
                <div className="dashboard-classroom__card-mini-info">
                  <h4>{classroom.name}</h4>
                  <p>
                    {classroom.memberCount} {t("classroom.members", "members")}
                  </p>
                </div>
              </div>
            </ClickableTile>
          );
        })}
      </div>
    );
  };

  const refreshBanks = async () => {
    setBanksLoading(true);
    try {
      const rows = await listMine();
      setQuestionBanks(rows);
    } finally {
      setBanksLoading(false);
    }
  };

  const visibleBanks = showAllBanks ? questionBanks : questionBanks.slice(0, DEFAULT_BANK_CARDS);
  const hasMoreBanks = questionBanks.length > DEFAULT_BANK_CARDS;

  const renderBankSection = () => {
    if (!isTeacherOrAdmin) return null;

    return (
      <section className="dashboard-classroom__section">
        <header className="dashboard-classroom__section-header">
          <h4>{t("dashboard.questionBanksSection.title", "我的題庫")}</h4>
          {questionBanks.length > 0 && (
            <button
              type="button"
              className="dashboard-classroom__section-header-link"
              onClick={() => setBankCreateOpen(true)}
            >
              {t("questionBank.createBank", "建立題庫")} +
            </button>
          )}
        </header>

        {banksLoading ? (
          <div className="dashboard-classroom__bank-grid">
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonPlaceholder key={idx} className="dashboard-classroom__skeleton" />
            ))}
          </div>
        ) : questionBanks.length === 0 ? (
          <Tile className="dashboard-classroom__empty-tile">
            <div className="dashboard-classroom__bank-empty">
              <Catalog size={32} />
              <div>
                <h4>{t("dashboard.questionBanksSection.empty", "尚無題庫")}</h4>
                <p>{t("dashboard.questionBanksSection.emptyHint", "建立題庫以開始整理題目。")}</p>
              </div>
            </div>
          </Tile>
        ) : (
          <>
            <div className="dashboard-classroom__bank-grid">
              {visibleBanks.map((bank) => (
                <BankGalleryCard
                  key={bank.id}
                  title={bank.name}
                  category={bank.category}
                  provider={bank.ownerUsername || welcomeName}
                  providerVerified={bank.verified}
                  downloads={String(bank.questionCount)}
                  coverUrl={bank.coverUrl || undefined}
                  icon={bank.icon || undefined}
                  onClick={() => navigate(`/question-banks/${bank.id}`)}
                />
              ))}
            </div>
            {hasMoreBanks && (
              <Button
                kind="ghost"
                size="sm"
                className="dashboard-classroom__show-more"
                onClick={() => setShowAllBanks((prev) => !prev)}
              >
                {showAllBanks
                  ? t("dashboard.questionBanksSection.showLess", "收起")
                  : t("dashboard.questionBanksSection.showMore", "顯示更多")}
              </Button>
            )}
          </>
        )}
      </section>
    );
  };

  return (
    <div className="dashboard-classroom">
      <QJudgeHeroWidget
        title={`${welcomeName} ${t("dashboard.classroomHub.welcomeBack", "歡迎回來")}`}
        actions={
          isTeacherOrAdmin ? (
            <MenuButton label={t("common:button.create", "新增")} kind="primary" size="md">
              <MenuItem label={t("classroom.create", "建立教室")} onClick={() => setCreateOpen(true)} />
              <MenuItem label={t("questionBank.createBank", "建立題庫")} onClick={() => setBankCreateOpen(true)} />
            </MenuButton>
          ) : undefined
        }
        kpiCards={
          <>
            <KpiCard
              icon={Education}
              value={loading ? "–" : classrooms.length}
              label={t("dashboard.kpi.classrooms", "教室")}
              showBorder={false}
            />
            {isTeacherOrAdmin && (
              <KpiCard
                icon={Catalog}
                value={banksLoading ? "–" : questionBanks.length}
                label={t("dashboard.kpi.questionBanks", "題庫")}
                showBorder
              />
            )}
          </>
        }
      />

      {/* Content Sections */}
      <div className="dashboard-classroom__main">
        <section className="dashboard-classroom__section">
          <header className="dashboard-classroom__section-header">
            <h4>{t("dashboard.classroomHub.listTitle", "我的教室")}</h4>
          </header>
          {renderClassroomGrid(orderedClassrooms)}
        </section>

        {/* Question Banks (teacher/admin only) */}
        {renderBankSection()}
      </div>

      {isTeacherOrAdmin ? (
        <>
          <CreateClassroomModal
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onSubmit={handleCreateClassroom}
          />
          <CreateBankModal
            open={bankCreateOpen}
            onClose={() => setBankCreateOpen(false)}
            onCreated={(bank) => {
              setBankCreateOpen(false);
              void refreshBanks();
              navigate(`/question-banks/${bank.id}`);
            }}
          />
        </>
      ) : null}
    </div>
  );
};

export default DashboardScreen;
