import type { ReactNode } from "react";
import { Button } from "@carbon/react";
import { Launch, QrCode, View } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import AdminSegmentedDashboard from "@/features/contest/components/admin/AdminSegmentedDashboard";
import PreparationChecklist from "@/features/contest/components/admin/PreparationChecklist";
import type {
  AdminPreparationOverviewData,
  PreparationItemKey,
} from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import { BlockHeader } from "@/shared/components/dashboard";
import styles from "./AdminPreparationCommandCenter.module.scss";

interface AdminPreparationCommandCenterProps {
  header: ReactNode;
  data: AdminPreparationOverviewData;
  publishing: boolean;
  attendanceCheckEnabled: boolean;
  onItemAction: (key: PreparationItemKey) => void;
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
  const isDraft = data.phase === "draft";

  const primary = (
    <div className={styles.primaryColumn}>
      <div className={styles.infoRow}>
        {data.infoCells.map((cell) => (
          <div key={cell.key} className={styles.infoCell}>
            <span className={styles.infoLabel}>{cell.label}</span>
            <span className={styles.infoValue}>{cell.value}</span>
          </div>
        ))}
      </div>

      <section>
        <BlockHeader
          title={t("adminOverview.preparation.checklistTitle", "發布前檢查")}
          description={t(
            "adminOverview.preparation.checklistDescription",
            "先把缺的補齊，再把競賽發布給學生。",
          )}
        />
        <PreparationChecklist
          items={data.checklist}
          onItemAction={onItemAction}
        />
      </section>

      <section>
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
      </section>
    </div>
  );

  const side = (
    <div className={styles.sideColumn}>
      <section className={styles.sideBlock}>
        <span className={styles.sideLabel}>
          {t("adminOverview.preparation.nextStep", "下一步")}
        </span>
        {isDraft ? (
          <>
            <Button
              kind="primary"
              disabled={publishing}
              onClick={onPublishContest}
            >
              {t("adminOverview.actions.publishContest", "發布競賽")}
            </Button>
            <p className={styles.sideNote}>
              {data.canPublish
                ? t(
                    "adminOverview.actions.publishContestBody",
                    "發布後學生就可以看到這場競賽。",
                  )
                : t(
                    "adminOverview.preparation.blockedBySchedule",
                    "發布前會先請你設定考試時間",
                  )}
            </p>
          </>
        ) : (
          <>
            {data.countdownMs !== null && (
              <p className={styles.countdown}>
                {t("adminOverview.preparation.startsIn", "距離開考 {{value}}", {
                  value: formatCountdown(data.countdownMs),
                })}
              </p>
            )}
            <Button kind="tertiary" renderIcon={Launch} onClick={onOpenContestHome}>
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
          </>
        )}
      </section>

      <section className={styles.sideBlock}>
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
      </section>

      {!isDraft && (
        <section className={styles.sideBlock}>
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
        </section>
      )}
    </div>
  );

  return (
    <AdminSegmentedDashboard
      ariaLabel={t("adminOverview.preparation.ariaLabel", "競賽準備總覽")}
      header={header}
      primary={primary}
      side={side}
    />
  );
}
