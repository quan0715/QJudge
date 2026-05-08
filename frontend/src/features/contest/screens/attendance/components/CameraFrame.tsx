import { type ReactNode, type Ref } from "react";
import { motion } from "motion/react";

import { type FrameHintStatus, getFrameHint } from "../lib/frameHint";
import styles from "./CameraFrame.module.scss";

type Aspect = "1/1" | "3/4";

type Props = {
  aspect: Aspect;
  hint: FrameHintStatus;
  videoRef?: Ref<HTMLVideoElement>;
  fallback?: ReactNode;
  showVideo: boolean;
  cornerStyle?: "qr" | "photo";
  hintText?: string;
};

export function CameraFrame({
  aspect,
  hint,
  videoRef,
  fallback,
  showVideo,
  cornerStyle = "qr",
  hintText,
}: Props) {
  const tokens = getFrameHint(hint);

  return (
    <motion.div
      className={styles.frame}
      data-aspect={aspect}
      data-corner={cornerStyle}
      data-pulse={tokens.pulse ? "true" : undefined}
      data-shake={tokens.shake ? "true" : undefined}
      style={
        {
          "--frame-outline": tokens.outline,
          "--frame-glow": tokens.glow,
          aspectRatio: aspect.replace("/", " / "),
        } as React.CSSProperties
      }
      layout
      transition={{ duration: 0.24, ease: [0.4, 0.14, 0.3, 1] }}
    >
      <div className={styles.viewport}>
        {showVideo && videoRef ? (
          <video
            ref={videoRef}
            className={styles.video}
            autoPlay
            playsInline
            muted
          />
        ) : (
          fallback
        )}
      </div>
      <div className={styles.outline} aria-hidden="true" />
      <div className={styles.corners} aria-hidden="true" />
      {hint === "validating" ? (
        <div className={styles.spinner} aria-hidden="true">
          <span />
        </div>
      ) : null}
      {hintText ? <div className={styles.hintText}>{hintText}</div> : null}
    </motion.div>
  );
}
