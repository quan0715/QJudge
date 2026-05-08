import { type Ref } from "react";
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
  frozenScanUrl?: string;
  error?: string | null;
};

export function ScanContent({
  title,
  description,
  hint,
  hintText,
  videoRef,
  showVideo,
  frozenScanUrl,
  error,
}: Props) {
  const { t } = useTranslation("contest");
  return (
    <div className={styles.content}>
      <div className={styles.heading}>
        <h1>{title}</h1>
        <p>{description}</p>
        {error ? (
          <InlineNotification
            kind="error"
            title={t("attendance.scan.cannotComplete", "無法完成簽到")}
            subtitle={error}
            lowContrast
            hideCloseButton
            className={styles.notification}
          />
        ) : null}
      </div>
      <div className={styles.frameWrapper} data-carbon-theme="g100">
        <CameraFrame
          aspect="1/1"
          hint={hint}
          videoRef={videoRef}
          showVideo={showVideo}
          cornerStyle="qr"
          hintText={hintText}
          fallback={
            frozenScanUrl ? (
              <img className={styles.previewImage} src={frozenScanUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : null
          }
        />
      </div>
    </div>
  );
}
