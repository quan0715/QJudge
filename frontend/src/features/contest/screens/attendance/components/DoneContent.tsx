import { CheckmarkFilled } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type { AttendancePhotoRequirement } from "../lib/photoRequirements";
import styles from "./StepContent.module.scss";

type Props = {
  purposeLabel: string;
  contestTitle?: string;
  scannedAtLabel: string;
  requirements: AttendancePhotoRequirement[];
  photoUrls: Partial<Record<string, string>>;
};

export function DoneContent({
  purposeLabel,
  contestTitle,
  scannedAtLabel,
  requirements,
  photoUrls,
}: Props) {
  const { t } = useTranslation("contest");
  return (
    <div className={styles.content}>
      <div className={styles.successWrap}>
        <div className={styles.successMark} aria-hidden="true">
          <CheckmarkFilled size={42} />
        </div>
        <div className={styles.successHeading}>
          <h1>
            {t("attendance.done.title", "已完成{{purpose}}認證", {
              purpose: purposeLabel,
            })}
          </h1>
          <p>
            {t("attendance.done.description", "系統已記錄您的{{purpose}}事件。", {
              purpose: purposeLabel,
            })}
          </p>
        </div>
      </div>
      <div style={{ display: "grid", gap: "1rem", overflow: "auto", minHeight: 0 }}>
        <section className={styles.summary} aria-label={t("attendance.done.resultLabel", "簽到結果")}>
          {contestTitle ? (
            <div>
              <span>{t("attendance.done.contest", "競賽")}</span>
              <strong>{contestTitle}</strong>
            </div>
          ) : null}
          <div>
            <span>{t("attendance.done.time", "時間")}</span>
            <strong>{scannedAtLabel}</strong>
          </div>
          <div>
            <span>{t("attendance.done.status", "狀態")}</span>
            <strong>{t("attendance.done.uploaded", "已上傳")}</strong>
          </div>
        </section>
        <section className={styles.thumbnails} aria-label={t("attendance.done.photosLabel", "佐證照片")}>
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
