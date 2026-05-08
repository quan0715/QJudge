import { InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";

import type { AttendancePhotoRequirement } from "../lib/photoRequirements";
import styles from "./StepContent.module.scss";

type Props = {
  purposeLabel: string;
  scannedAtLabel: string;
  photoCountLabel: string;
  requirements: AttendancePhotoRequirement[];
  photoUrls: Partial<Record<string, string>>;
  uploadError?: string | null;
};

export function ConfirmContent({
  purposeLabel,
  scannedAtLabel,
  photoCountLabel,
  requirements,
  photoUrls,
  uploadError,
}: Props) {
  const { t } = useTranslation("contest");
  return (
    <div className={styles.content}>
      <div className={styles.heading}>
        <h1>
          {t("attendance.confirm.title", "確認{{purpose}}資訊", {
            purpose: purposeLabel,
          })}
        </h1>
        <p>{t("attendance.confirm.description", "確認資訊與照片清楚後即可上傳。")}</p>
        {uploadError ? (
          <InlineNotification
            kind="error"
            title={t("attendance.confirm.uploadFailed", "上傳失敗")}
            subtitle={uploadError}
            lowContrast
            hideCloseButton
            className={styles.notification}
          />
        ) : null}
      </div>
      <div style={{ display: "grid", gap: "1rem", overflow: "auto", minHeight: 0 }}>
        <section className={styles.summary} aria-label={t("attendance.confirm.infoLabel", "簽到資訊")}>
          <div>
            <span>{t("attendance.confirm.type", "類型")}</span>
            <strong>{purposeLabel}</strong>
          </div>
          <div>
            <span>{t("attendance.confirm.scannedAt", "掃描時間")}</span>
            <strong>{scannedAtLabel}</strong>
          </div>
          <div>
            <span>{t("attendance.confirm.photoStatus", "照片狀態")}</span>
            <strong>{photoCountLabel}</strong>
          </div>
        </section>
        <section className={styles.thumbnails} aria-label={t("attendance.confirm.photosLabel", "佐證照片")}>
          {requirements.map((requirement) => {
            const url = photoUrls[requirement.id];
            return url ? (
              <figure key={requirement.id}>
                <img
                  src={url}
                  alt={t("attendance.confirm.photoPreviewAlt", "{{label}}預覽", {
                    label: requirement.label,
                  })}
                />
                <figcaption>{requirement.label}</figcaption>
              </figure>
            ) : null;
          })}
        </section>
      </div>
    </div>
  );
}
