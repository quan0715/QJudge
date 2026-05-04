import { Button, Tag } from "@carbon/react";
import type { ReactNode } from "react";
import {
  ChartBar,
  CheckmarkFilled,
  DocumentTasks,
  Settings,
  TaskComplete,
  WarningAlt,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import AdminInsightRail from "@/features/contest/components/admin/AdminInsightRail";
import AdminSegmentedDashboard from "@/features/contest/components/admin/AdminSegmentedDashboard";
import type { AdminPanelId } from "@/features/contest/modules/types";
import type {
  AdminPreparationDashboardData,
  PreparationReadinessState,
} from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import styles from "./AdminPreparationDashboard.module.scss";

interface AdminPreparationDashboardProps {
  data: AdminPreparationDashboardData;
  onOpenPanel: (panel: AdminPanelId) => void;
  onOpenSettings: () => void;
  primary: ReactNode;
}

const readinessTagType = (status: PreparationReadinessState) => {
  if (status === "done") return "green";
  if (status === "missing") return "red";
  return "warm-gray";
};

const ReadinessIcon = ({ status }: { status: PreparationReadinessState }) => {
  if (status === "done") {
    return <CheckmarkFilled className={styles.statusDone} size={18} />;
  }
  return <WarningAlt className={styles.statusWarning} size={18} />;
};

export default function AdminPreparationDashboard({
  data,
  onOpenPanel,
  onOpenSettings,
  primary,
}: AdminPreparationDashboardProps) {
  const { t } = useTranslation("contest");
  const panelEntries: Array<{
    key: string;
    title: string;
    description: string;
    icon: typeof DocumentTasks;
    onClick: () => void;
  }> = [
    {
      key: "problem-editor",
      title: t(
        "adminPreparationDashboard.entries.problemEditor.title",
        "題目編輯與管理",
      ),
      description: t(
        "adminPreparationDashboard.entries.problemEditor.description",
        "維護題目、考卷內容與分數",
      ),
      icon: DocumentTasks,
      onClick: () => onOpenPanel("problem_editor"),
    },
    {
      key: "grading",
      title: t(
        "adminPreparationDashboard.entries.grading.title",
        "批改與成績",
      ),
      description: t(
        "adminPreparationDashboard.entries.grading.description",
        "進入批改、統計與成績發布",
      ),
      icon: ChartBar,
      onClick: () => onOpenPanel("grading"),
    },
    {
      key: "settings",
      title: t(
        "adminPreparationDashboard.entries.settings.title",
        "競賽設定",
      ),
      description: t(
        "adminPreparationDashboard.entries.settings.description",
        "調整時間、規則與考試模式",
      ),
      icon: Settings,
      onClick: onOpenSettings,
    },
  ];

  return (
    <AdminSegmentedDashboard
      ariaLabel={t("adminPreparationDashboard.ariaLabel", "準備與成績儀表板")}
      primary={primary}
      side={<AdminInsightRail cards={data.insightCards} />}
      tabs={[
        {
          key: "readiness",
          label: t("adminPreparationDashboard.tabs.readiness", "準備狀態"),
          content: (
            <>
              <div className={styles.panelHeader}>
                <div>
                  <h3>
                    {t(
                      "adminPreparationDashboard.readiness.title",
                      "準備狀態",
                    )}
                  </h3>
                  <p>
                    {t(
                      "adminPreparationDashboard.readiness.description",
                      "非考試時段優先確認能否順利開考與收尾。",
                    )}
                  </p>
                </div>
                <TaskComplete size={18} />
              </div>
              <ul className={styles.checklist}>
                {data.checklistItems.map((item) => (
                  <li key={item.key} className={styles.checklistItem}>
                    <ReadinessIcon status={item.status} />
                    <div className={styles.checklistText}>
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </div>
                    <Tag size="sm" type={readinessTagType(item.status)}>
                      {item.statusLabel}
                    </Tag>
                  </li>
                ))}
              </ul>
            </>
          ),
        },
        {
          key: "grading",
          label: t("adminPreparationDashboard.tabs.grading", "批改與成績"),
          content: (
            <div className={styles.gradingPanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h3>
                    {t(
                      "adminPreparationDashboard.grading.title",
                      "批改與成績",
                    )}
                  </h3>
                  <p>
                    {t(
                      "adminPreparationDashboard.grading.description",
                      "考後查看批改剩餘量與成績發布狀態。",
                    )}
                  </p>
                </div>
                <ChartBar size={18} />
              </div>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-label={t(
                  "adminPreparationDashboard.grading.progressLabel",
                  "批改進度",
                )}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={data.grading.progressPercent}
              >
                <div
                  className={styles.progressFill}
                  style={{ width: `${data.grading.progressPercent}%` }}
                />
              </div>
              <dl className={styles.gradingList}>
                <div>
                  <dt>
                    {t(
                      "adminPreparationDashboard.grading.progressLabel",
                      "批改進度",
                    )}
                  </dt>
                  <dd>{data.grading.progressLabel}</dd>
                </div>
                <div>
                  <dt>
                    {t(
                      "adminPreparationDashboard.grading.ungraded",
                      "待批改",
                    )}
                  </dt>
                  <dd>{data.grading.ungradedAnswers}</dd>
                </div>
                <div>
                  <dt>
                    {t(
                      "adminPreparationDashboard.grading.resultsStatus",
                      "成績狀態",
                    )}
                  </dt>
                  <dd>{data.grading.resultsLabel}</dd>
                </div>
              </dl>
              <Button kind="primary" onClick={() => onOpenPanel("grading")}>
                {t(
                  "adminPreparationDashboard.grading.openButton",
                  "前往批改與成績",
                )}
              </Button>
            </div>
          ),
        },
        {
          key: "entries",
          label: t("adminPreparationDashboard.tabs.entries", "管理入口"),
          content: (
            <div className={styles.entryGrid}>
              {panelEntries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <Button
                    key={entry.key}
                    className={styles.entryButton}
                    kind="tertiary"
                    onClick={entry.onClick}
                  >
                    <span className={styles.entryText}>
                      <span>{entry.title}</span>
                      <small>{entry.description}</small>
                    </span>
                    <Icon size={18} />
                  </Button>
                );
              })}
            </div>
          ),
        },
      ]}
    />
  );
}
