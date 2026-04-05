import { useEffect, useMemo, useState } from "react";
import {
  Button,
  InlineNotification,
  Tag,
  Tile,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ContestDetail } from "@/core/entities/contest.entity";
import styles from "./DraftChecklistPanel.module.scss";

type ChecklistStatus = "done" | "suggest" | "missing";

interface DraftChecklistPanelProps {
  contest: ContestDetail;
  loading?: boolean;
  onOpenProblemEditor: () => void;
  onOpenSettings: () => void;
  onPublishContest: () => Promise<void>;
}

const ChecklistRow = ({
  title,
  subtitle,
  status,
  action,
}: {
  title: string;
  subtitle: string;
  status: ChecklistStatus;
  action?: React.ReactNode;
}) => {
  const { t } = useTranslation("contest");
  const tagType = status === "done" ? "green" : status === "missing" ? "red" : "warm-gray";
  const tagText =
    status === "done"
      ? t("adminOverview.draftChecklist.status.done", "已完成")
      : status === "missing"
        ? t("adminOverview.draftChecklist.status.missing", "尚未設定")
        : t("adminOverview.draftChecklist.status.suggest", "建議設定");

  return (
    <div className={styles.checkItem}>
      <div className={styles.checkItemMain}>
        <div className={styles.checkItemTitleRow}>
          <span className={styles.checkItemTitle}>{title}</span>
          <Tag type={tagType} size="sm">
            {tagText}
          </Tag>
        </div>
        <p className={styles.checkItemSubtitle}>{subtitle}</p>
      </div>
      {action ? <div className={styles.checkItemAction}>{action}</div> : null}
    </div>
  );
};

export default function DraftChecklistPanel({
  contest,
  loading = false,
  onOpenProblemEditor,
  onOpenSettings,
  onPublishContest,
}: DraftChecklistPanelProps) {
  const { t } = useTranslation("contest");
  const [publishLoading, setPublishLoading] = useState(false);

  useEffect(() => {
    if (!publishLoading) return;
    if (contest.status !== "draft") {
      setPublishLoading(false);
    }
  }, [contest.status, publishLoading]);

  const workItemCount =
    contest.contestType === "paper_exam" ? contest.examQuestionsCount : contest.problems.length;

  const checklistRows = useMemo(
    () => [
      {
        key: "problems",
        title: t("adminOverview.draftChecklist.items.problems.title", "題目準備"),
        subtitle:
          workItemCount > 0
            ? t("adminOverview.draftChecklist.items.problems.ready", "已設定 {{count}} 題", {
                count: workItemCount,
              })
            : t("adminOverview.draftChecklist.items.problems.empty", "尚未新增題目，建議先完成題目內容"),
        status: (workItemCount > 0 ? "done" : "missing") as ChecklistStatus,
        action: (
          <Button kind="tertiary" size="sm" onClick={onOpenProblemEditor}>
            {t("adminOverview.draftChecklist.actions.openProblems", "前往題目管理")}
          </Button>
        ),
      },
      {
        key: "schedule",
        title: t("adminOverview.draftChecklist.items.schedule.title", "考試時段"),
        subtitle: t(
          "adminOverview.draftChecklist.items.schedule.subtitle",
          "草稿階段不需設定時段，發布時會要求你設定開始時間與時長",
        ),
        status: "missing" as ChecklistStatus,
      },
      {
        key: "rules",
        title: t("adminOverview.draftChecklist.items.rules.title", "競賽規則"),
        subtitle: (contest.rules ?? "").trim()
          ? t("adminOverview.draftChecklist.items.rules.done", "已設定規則內容")
          : t("adminOverview.draftChecklist.items.rules.suggest", "建議補上考試規則與注意事項"),
        status: ((contest.rules ?? "").trim() ? "done" : "suggest") as ChecklistStatus,
        action: (
          <Button kind="tertiary" size="sm" onClick={onOpenSettings}>
            {t("adminOverview.draftChecklist.actions.openSettings", "開啟完整設定")}
          </Button>
        ),
      },
      {
        key: "security",
        title: t("adminOverview.draftChecklist.items.security.title", "存取與安全設定"),
        subtitle: t(
          "adminOverview.draftChecklist.items.security.subtitle",
          "可先調整嚴格模式、重進規則與密碼，提升正式發布前的一致性",
        ),
        status: "suggest" as ChecklistStatus,
      },
    ],
    [contest.rules, onOpenProblemEditor, onOpenSettings, t, workItemCount],
  );

  return (
    <Tile className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          {t("adminOverview.draftChecklist.title", "發布前 Checklist")}
        </h3>
        <p className={styles.subtitle}>
          {t(
            "adminOverview.draftChecklist.subtitle",
            "發布不會被阻擋；以下項目可協助你在發布前把競賽設定更完整",
          )}
        </p>
        <Button
          kind="primary"
          size="sm"
          disabled={publishLoading}
          onClick={() => {
            void (async () => {
              setPublishLoading(true);
              try {
                await onPublishContest();
              } finally {
                setPublishLoading(false);
              }
            })();
          }}
        >
          {t("adminOverview.actions.publishContest", "發布競賽")}
        </Button>
      </div>

      {loading && (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title={t("common:message.loading", "載入中")}
          subtitle={t("adminOverview.draftChecklist.loading", "正在載入競賽資料")}
        />
      )}

      <div className={styles.checkList}>
        {checklistRows.map((item) => (
          <ChecklistRow
            key={item.key}
            title={item.title}
            subtitle={item.subtitle}
            status={item.status}
            action={item.action}
          />
        ))}
      </div>
    </Tile>
  );
}
