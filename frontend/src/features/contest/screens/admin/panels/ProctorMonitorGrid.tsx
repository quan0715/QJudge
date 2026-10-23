import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, ClickableTile, Tag } from "@carbon/react";
import { ChevronLeft, ChevronRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ContestParticipant } from "@/core/entities/contest.entity";
import type { LiveState, LiveTargetSnapshot } from "@/core/entities/liveMonitoring.entity";
import type { LiveTransport } from "@/infrastructure/realtime/livekitTransport";
import styles from "./ProctorMonitorGrid.module.scss";

function ScreenTile({ participant, identity, transport, state, onFocus }: {
  participant: ContestParticipant;
  identity?: string;
  transport: LiveTransport | null;
  state: LiveState;
  onFocus: (userId: string) => void;
}) {
  const { t } = useTranslation("contest");
  const [playing, setPlaying] = useState<{ identity?: string; transport: LiveTransport | null } | null>(null);
  const name = participant.displayName || participant.username;
  const bindVideo = useCallback((element: HTMLVideoElement | null) => {
    if (identity) transport?.bindTargetVideo(identity, "screen_share", element);
  }, [identity, transport]);
  const connected = playing?.identity === identity && playing?.transport === transport && !!transport && state === "connected";
  const connecting = state === "connecting" || state === "reconnecting";
  return (
    <ClickableTile role="button" onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onFocus(participant.userId); }
    }} className={styles.tile} onClick={() => onFocus(participant.userId)}
      aria-label={t("proctoringPanel.focusStudent", "放大 {{name}}", { name })}>
      <div className={styles.identity}>
        <span className={styles.name}>{name}<small>@{participant.username}</small></span>
        <Tag type={connected ? "green" : "cool-gray"} size="sm">
          {connected ? t("liveView.connected", "已連線")
            : connecting ? t("action.loading", "連線中...")
              : t("proctoringPanel.noSignal", "No signal")}
        </Tag>
      </div>
      <div className={styles.screen}>
        <video ref={bindVideo} autoPlay playsInline muted
          onPlaying={() => setPlaying({ identity, transport })} onPause={() => setPlaying(null)}
          onEnded={() => setPlaying(null)} onEmptied={() => setPlaying(null)}
          onWaiting={() => setPlaying(null)} />
        {!connected && <span className={styles.placeholder}>
          {connecting ? t("action.loading", "連線中...")
            : identity ? t("proctoringPanel.waitingScreen", "等待螢幕畫面")
              : t("proctoringPanel.noScreen", "尚無螢幕分享")}
        </span>}
      </div>
      {participant.violationCount > 0 && <span className={styles.attention}>
        {t("proctoringPanel.violationCount", "違規 {{count}} 次", { count: participant.violationCount })}
      </span>}
    </ClickableTile>
  );
}

export default function ProctorMonitorGrid({ participants, snapshot, transport, state, size, page, onPageChange, onFocus }: {
  participants: ContestParticipant[];
  snapshot: LiveTargetSnapshot;
  transport: LiveTransport | null;
  state: LiveState;
  size: 4 | 9;
  page: number;
  onPageChange: (page: number) => void;
  onFocus: (userId: string) => void;
}) {
  const { t } = useTranslation("contest");
  // Stable name order keeps monitoring tiles from moving when live status changes.
  const rows = useMemo(() => [...participants].sort((a, b) =>
    (a.displayName || a.username).localeCompare(b.displayName || b.username)
      || a.userId.localeCompare(b.userId)), [participants]);
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = useMemo(() => rows.slice(currentPage * size, (currentPage + 1) * size), [rows, currentPage, size]);
  const targets = useMemo(() => new Map(snapshot.targets.map((target) => [target.userId, target])), [snapshot.targets]);
  useEffect(() => {
    transport?.selectTargets(visible.flatMap((participant) => {
      const target = targets.get(participant.userId);
      return target?.sources.includes("screen_share")
        ? [{ identity: target.identity, sources: ["screen_share" as const] }] : [];
    }));
  }, [transport, visible, targets]);

  return <div className={styles.root}>
    <div className={styles.grid} data-size={size}>
      {visible.map((participant) => {
        const target = targets.get(participant.userId);
        return <ScreenTile key={participant.userId} participant={participant}
          identity={target?.sources.includes("screen_share") ? target.identity : undefined}
          transport={transport} state={state} onFocus={onFocus} />;
      })}
      {visible.length === 0 && <p>{t("proctoringPanel.noMatches", "沒有符合條件的考生")}</p>}
    </div>
    <div className={styles.pagination}>
      <span>{t("proctoringPanel.pageCount", "第 {{page}}／{{pages}} 頁・{{count}} 人", {
        page: currentPage + 1, pages: pageCount, count: rows.length,
      })}</span>
      <Button kind="ghost" size="sm" renderIcon={ChevronLeft} hasIconOnly
        iconDescription={t("proctoringPanel.previousPage", "上一頁")}
        disabled={currentPage === 0} onClick={() => onPageChange(currentPage - 1)} />
      <Button kind="ghost" size="sm" renderIcon={ChevronRight} hasIconOnly
        iconDescription={t("proctoringPanel.nextPage", "下一頁")}
        disabled={currentPage + 1 >= pageCount} onClick={() => onPageChange(currentPage + 1)} />
    </div>
  </div>;
}
