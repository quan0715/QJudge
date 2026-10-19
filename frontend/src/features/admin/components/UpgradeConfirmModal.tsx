import { useTranslation } from "react-i18next";
import { InlineNotification, Modal } from "@carbon/react";

import { shortVersion } from "@/core/entities/systemVersion.entity";

interface UpgradeConfirmModalProps {
  /** Full sha of the release to deploy. */
  target: string;
  /** The start request is in flight, so the admin cannot send it a second time. */
  submitting: boolean;
  /** Why the upgrade could not start, shown in the dialog so the admin can try again. */
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** States what an online upgrade costs before anything starts. Mount it only while it is needed. */
const UpgradeConfirmModal = ({
  target,
  submitting,
  error,
  onConfirm,
  onCancel,
}: UpgradeConfirmModalProps) => {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation("common");

  return (
    <Modal
      open
      size="sm"
      modalHeading={t("system.version.confirm.title", "確認更新到 {{version}}", {
        version: shortVersion(target),
      })}
      primaryButtonText={t("system.version.confirm.start", "開始更新")}
      secondaryButtonText={tc("button.cancel", "取消")}
      primaryButtonDisabled={submitting}
      onRequestSubmit={onConfirm}
      // The request is already on its way, so closing now would hide how it ends.
      onRequestClose={() => {
        if (!submitting) onCancel();
      }}
    >
      <p>
        {t(
          "system.version.confirm.body",
          "更新前會先備份資料庫。切換服務時網站會中斷約 30 秒到 1 分鐘，正在作答的學生可能會短暫看到錯誤頁。更新失敗時請查看紀錄及服務狀態，必要時由維護者復原。",
        )}
      </p>
      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={t("system.version.startFailed", "無法開始更新")}
          subtitle={error}
        />
      ) : null}
    </Modal>
  );
};

export default UpgradeConfirmModal;
