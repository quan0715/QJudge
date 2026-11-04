import { useCallback, useState } from "react";
import { Button, Modal } from "@carbon/react";
import { Scan } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type { ContestParticipant } from "@/core/entities/contest.entity";
import { parseStudentLocatorQrValue } from "@/features/contest/attendance/attendanceQr";
import { useCameraStream } from "@/features/contest/screens/attendance/hooks/useCameraStream";
import { useQrScanner } from "@/features/contest/screens/attendance/hooks/useQrScanner";
import { useToast } from "@/shared/contexts/ToastContext";
import styles from "./ParticipantQrScanButton.module.scss";

interface ParticipantQrScanButtonProps {
  contestId: string;
  participants: ContestParticipant[];
  onSelect: (userId: string) => void;
}

export default function ParticipantQrScanButton({ contestId, participants, onSelect }: ParticipantQrScanButtonProps) {
  const { t } = useTranslation("contest");
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const { videoRef, setVideoElement, cameraState, cameraError } = useCameraStream({
    active: open,
    facingMode: "environment",
    messages: {
      unavailable: t(
        "adminOverview.command.participants.studentQr.cameraUnavailable",
        "無法使用相機，請改用搜尋欄選取學生。",
      ),
    },
  });

  const fail = useCallback(
    (subtitle: string) => {
      setOpen(false);
      showToast({ kind: "error", title: t("common.error", "錯誤"), subtitle });
    },
    [showToast, t],
  );

  const handleDetected = useCallback(
    (raw: string) => {
      const parsed = parseStudentLocatorQrValue(raw);
      if (!parsed) {
        fail(t("adminOverview.command.participants.studentQr.invalid", "這不是 QJudge 考生 QR。"));
        return;
      }
      if (parsed.contestId !== contestId) {
        fail(t("adminOverview.command.participants.studentQr.wrongContest", "這不是本場考試的考生 QR。"));
        return;
      }
      const participant = participants.find((item) => String(item.userId) === parsed.userId);
      if (!participant) {
        fail(t("adminOverview.command.participants.studentQr.notFound", "找不到對應的考生。"));
        return;
      }
      setOpen(false);
      onSelect(participant.userId);
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("adminOverview.command.participants.studentQr.selected", "已選取考生。"),
      });
    },
    [contestId, fail, onSelect, participants, showToast, t],
  );

  const scannerMode = useQrScanner({
    videoRef,
    active: open && cameraState === "ready",
    onDetected: handleDetected,
  });

  return (
    <>
      <Button
        kind="ghost"
        size="md"
        hasIconOnly
        renderIcon={Scan}
        iconDescription={t("adminOverview.screen.actions.studentQrScan", "掃描學生 QR")}
        onClick={() => setOpen(true)}
      />
      <Modal
        open={open}
        modalHeading={t("adminOverview.command.participants.studentQr.heading", "掃描學生 QR")}
        passiveModal
        onRequestClose={() => setOpen(false)}
        size="sm"
      >
        <div className={styles.studentQrScanner}>
          <div className={styles.studentQrScannerViewport}>
            {cameraState === "unavailable" ? (
              <p>{cameraError}</p>
            ) : (
              <video ref={setVideoElement} className={styles.studentQrScannerVideo} muted playsInline autoPlay />
            )}
          </div>
          <p className={styles.studentQrScannerHint}>
            {cameraState === "ready"
              ? t("adminOverview.command.participants.studentQr.ready", "請掃描學生競賽主頁上的考生 QR。")
              : t("adminOverview.command.participants.studentQr.requesting", "正在啟用相機...")}
            {scannerMode !== "waiting" ? <span> {scannerMode.toUpperCase()}</span> : null}
          </p>
        </div>
      </Modal>
    </>
  );
}
