import { useRef, useState, type ReactNode } from "react";
import { Button, Modal } from "@carbon/react";
import { Launch, QrCode, View } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import AdminSegmentedDashboard from "@/features/contest/components/admin/AdminSegmentedDashboard";
import PreparationChecklist from "@/features/contest/components/admin/PreparationChecklist";
import type {
  AdminPreparationOverviewData,
  PreparationChecklistItem,
  PreparationItemKey,
} from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import {
  BlockHeader,
  DashboardBlock,
  DashboardContainer,
  MetricBlock,
} from "@/shared/components/dashboard";
import styles from "./AdminPreparationCommandCenter.module.scss";

type ConfigurablePreparationItemKey = Exclude<PreparationItemKey, "review">;

interface AdminPreparationCommandCenterProps {
  header: ReactNode;
  data: AdminPreparationOverviewData;
  publishing: boolean;
  attendanceCheckEnabled: boolean;
  onItemAction: (key: ConfigurablePreparationItemKey) => void;
  onPublishContest: () => void;
  onRevertToDraft: () => void;
  onPreviewAsStudent: () => void;
  onOpenContestHome: () => void;
  onOpenAttendanceProjection: () => void;
}

const formatCountdown = (ms: number) => {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${minutes}m`;
};

export default function AdminPreparationCommandCenter({
  header,
  data,
  publishing,
  attendanceCheckEnabled,
  onItemAction,
  onPublishContest,
  onRevertToDraft,
  onPreviewAsStudent,
  onOpenContestHome,
  onOpenAttendanceProjection,
}: AdminPreparationCommandCenterProps) {
  const { t } = useTranslation("contest");
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewStepRef = useRef<HTMLAnchorElement>(null);
  const isDraft = data.phase === "draft";
  const schedule = data.checklist.find((item) => item.key === "schedule");
  const rules = data.checklist.find((item) => item.key === "rules");
  const problems = data.checklist.find((item) => item.key === "problems");

  const informationTitle = t(
    "adminOverview.preparation.steps.information",
    "競賽資訊設定",
  );
  const problemsTitle = t(
    "adminOverview.preparation.steps.problems",
    "競賽題目設定",
  );
  const reviewTitle = t(
    "adminOverview.preparation.steps.review",
    "確認資訊並發布競賽",
  );
  const informationLevel =
    schedule?.level === "blocking"
      ? "blocking"
      : schedule?.level === "done" && rules?.level === "done"
        ? "done"
        : "warning";

  const steps: PreparationChecklistItem[] = [
    {
      key: "schedule",
      title: informationTitle,
      description: t(
        "adminOverview.preparation.steps.informationDescription",
        "規則與時間",
      ),
      actionLabel: informationTitle,
      level: informationLevel,
    },
    {
      key: "problems",
      title: problemsTitle,
      description: problems?.description ?? "",
      actionLabel: problemsTitle,
      level: problems?.level ?? "warning",
    },
    {
      key: "review",
      title: reviewTitle,
      description: isDraft
        ? t(
            "adminOverview.preparation.steps.reviewDescription",
            "確認設定後發布給學生",
          )
        : t("adminOverview.preparation.steps.published", "競賽已發布"),
      actionLabel: reviewTitle,
      level: isDraft ? (data.canPublish ? "warning" : "blocking") : "done",
    },
  ];

  const closeReview = () => {
    setReviewOpen(false);
    window.setTimeout(() => reviewStepRef.current?.focus(), 0);
  };

  const primary = (
    <DashboardContainer layout="stack" dividers="auto">
      <DashboardContainer
        layout="split"
        dividers="auto"
        ariaLabel={t("adminOverview.preparation.infoLabel", "競賽基本資訊")}
      >
        {data.infoCells.map((cell) => (
          <DashboardBlock key={cell.key}>
            <MetricBlock label={cell.label} value={cell.value} />
          </DashboardBlock>
        ))}
      </DashboardContainer>

      <DashboardBlock>
        <BlockHeader
          title={t("adminOverview.preparation.steps.title", "競賽準備步驟")}
        />
        <PreparationChecklist
          items={steps}
          cardRefs={{ review: reviewStepRef }}
          onItemAction={(key) => {
            if (key === "review") {
              setReviewOpen(true);
              return;
            }
            onItemAction(key);
          }}
        />
      </DashboardBlock>

      <DashboardBlock>
        <BlockHeader
          title={t("adminOverview.preparation.participantsTitle", "考生名單")}
        />
        {data.participants.length === 0 ? (
          <p className={styles.emptyState}>
            {t(
              "adminOverview.preparation.participants.missing",
              "尚未加入任何考生",
            )}
          </p>
        ) : (
          <ul className={styles.participantList}>
            {data.participants.map((participant) => (
              <li key={participant.userId} className={styles.participantRow}>
                <span className={styles.participantName}>
                  {participant.displayName}
                </span>
                <span className={styles.participantHandle}>
                  @{participant.username}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardBlock>
    </DashboardContainer>
  );

  const side = (
    <DashboardContainer layout="stack" dividers="auto">
      {!isDraft && (
        <DashboardBlock>
          <div className={styles.sideBlock}>
            <span className={styles.sideLabel}>
              {t("adminOverview.preparation.nextStep", "下一步")}
            </span>
            {data.countdownMs !== null && (
              <p className={styles.countdown}>
                {t("adminOverview.preparation.startsIn", {
                  defaultValue: "距離開考 {{value}}",
                  value: formatCountdown(data.countdownMs),
                })}
              </p>
            )}
            <Button
              kind="tertiary"
              renderIcon={Launch}
              onClick={onOpenContestHome}
            >
              {t("adminOverview.actions.openContestHomepage", "開啟競賽主頁")}
            </Button>
            {attendanceCheckEnabled && (
              <Button
                kind="ghost"
                renderIcon={QrCode}
                onClick={onOpenAttendanceProjection}
              >
                {t(
                  "adminOverview.screen.actions.attendanceProjection",
                  "開啟簽到投屏",
                )}
              </Button>
            )}
          </div>
        </DashboardBlock>
      )}

      <DashboardBlock>
        <div className={styles.sideBlock}>
          <span className={styles.sideLabel}>
            {t("adminOverview.preparation.studentView", "學生看到的樣子")}
          </span>
          <Button kind="tertiary" renderIcon={View} onClick={onPreviewAsStudent}>
            {t("adminOverview.preparation.previewAsStudent", "預覽考生視角")}
          </Button>
          {isDraft && (
            <p className={styles.sideNote}>
              {t(
                "adminOverview.preparation.draftHiddenNote",
                "草稿不會出現在學生的競賽列表",
              )}
            </p>
          )}
        </div>
      </DashboardBlock>

      {!isDraft && (
        <DashboardBlock>
          <div className={styles.sideBlock}>
            <Button
              kind="danger--tertiary"
              dangerDescription={t(
                "adminOverview.preparation.dangerAction",
                "危險操作",
              )}
              disabled={publishing}
              onClick={onRevertToDraft}
            >
              {t("adminOverview.actions.revertToDraft", "退回草稿")}
            </Button>
          </div>
        </DashboardBlock>
      )}
    </DashboardContainer>
  );

  return (
    <>
      <AdminSegmentedDashboard
        ariaLabel={t("adminOverview.preparation.ariaLabel", "競賽準備總覽")}
        header={header}
        primary={primary}
        side={side}
      />
      <Modal
        open={reviewOpen}
        passiveModal={!isDraft}
        modalHeading={reviewTitle}
        selectorPrimaryFocus={
          data.canPublish
            ? undefined
            : "[data-qjudge-preparation-review-blocked]"
        }
        primaryButtonText={t("adminOverview.actions.publishContest", "發布競賽")}
        secondaryButtonText={t("adminOverview.preparation.steps.back", "返回")}
        primaryButtonDisabled={publishing || !data.canPublish}
        onRequestClose={closeReview}
        onRequestSubmit={
          isDraft
            ? () => {
                setReviewOpen(false);
                onPublishContest();
              }
            : undefined
        }
      >
        {isDraft && !data.canPublish && (
          <p
            className={styles.reviewBlocked}
            data-qjudge-preparation-review-blocked
            tabIndex={-1}
          >
            {t(
              "adminOverview.preparation.steps.reviewBlocked",
              "請先完成競賽資訊設定，再發布競賽。",
            )}
          </p>
        )}
        <dl className={styles.reviewList}>
          {data.infoCells.map((cell) => (
            <div key={cell.key}>
              <dt>{cell.label}</dt>
              <dd>{cell.value}</dd>
            </div>
          ))}
          {[schedule, rules, problems].map((item) =>
            item ? (
              <div key={item.key}>
                <dt>{item.title}</dt>
                <dd>{item.description}</dd>
              </div>
            ) : null,
          )}
        </dl>
      </Modal>
    </>
  );
}
