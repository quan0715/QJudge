import { type Ref } from "react";
import { CheckmarkFilled } from "@carbon/icons-react";
import { InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";

import { CameraFrame } from "./CameraFrame";
import { type FrameHintStatus } from "../lib/frameHint";
import styles from "./StepContent.module.scss";

type Props = {
  title: string;
  description: string;
  hint: FrameHintStatus;
  hintText?: string;
  videoRef: Ref<HTMLVideoElement>;
  showVideo: boolean;
  reviewUrl?: string;
  contestChipLabel?: string;
  error?: string | null;
};

export function PhotoContent({
  title,
  description,
  hint,
  hintText,
  videoRef,
  showVideo,
  reviewUrl,
  contestChipLabel,
  error,
}: Props) {
  const { t } = useTranslation("contest");
  return (
    <div className={styles.content}>
      <div className={styles.heading}>
        {contestChipLabel ? (
          <span className={styles.contestChip}>
            <CheckmarkFilled size={14} />
            {contestChipLabel}
          </span>
        ) : null}
        <h1>{title}</h1>
        <p>{description}</p>
        {error ? (
          <InlineNotification
            kind="error"
            title={t("attendance.photo.cannotComplete", "無法完成拍照")}
            subtitle={error}
            lowContrast
            hideCloseButton
            className={styles.notification}
          />
        ) : null}
      </div>
      <div className={styles.frameWrapper} data-carbon-theme="g100">
        {reviewUrl ? (
          <figure className={styles.preview}>
            <img src={reviewUrl} alt="" />
          </figure>
        ) : (
          <CameraFrame
            aspect="3/4"
            hint={hint}
            videoRef={videoRef}
            showVideo={showVideo}
            cornerStyle="photo"
            hintText={hintText}
          />
        )}
      </div>
    </div>
  );
}
