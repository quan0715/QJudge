import { CheckmarkFilled, InProgress, PauseFilled, WarningFilled } from "@carbon/icons-react";

import type { ContestParticipant } from "@/core/entities/contest.entity";
import { getParticipantDisplayName, isParticipantLive } from "@/features/contest/domain/participantRoster";
import { formatScore } from "@/shared/utils/scoreFormat";
import styles from "./ParticipantRail.module.scss";

type AttentionLevel = "none" | "low" | "medium" | "high";

const getAttentionLevel = (participant: ContestParticipant): AttentionLevel => {
  if (participant.examStatus === "locked" || participant.violationCount >= 5) return "high";
  if (participant.examStatus === "paused" || participant.violationCount >= 3) return "medium";
  if (
    participant.violationCount > 0 ||
    (participant.examStatus === "in_progress" && !isParticipantLive(participant))
  ) {
    return "low";
  }
  return "none";
};

interface ParticipantRailProps {
  // proctor: status and live signals for the exam; score: account and score for grading.
  mode: "proctor" | "score";
  participants: ContestParticipant[];
  selectedUserId: string;
  onSelect: (userId: string) => void;
}

export default function ParticipantRail({ mode, participants, selectedUserId, onSelect }: ParticipantRailProps) {
  return (
    <div className={styles.rosterList}>
      {participants.map((participant) => {
        const selected = participant.userId === selectedUserId;
        if (mode === "score") {
          return (
            <button
              key={participant.userId}
              type="button"
              aria-current={selected ? "true" : undefined}
              className={`${styles.rosterItem} ${styles.scoreItem} ${selected ? styles.rosterItemSelected : ""}`}
              onClick={() => onSelect(participant.userId)}
            >
              <span className={styles.rosterIdentity}>
                <span className={styles.rosterName}>{getParticipantDisplayName(participant)}</span>
                <span className={styles.rosterAccount}>{participant.username}</span>
              </span>
              <span className={styles.rosterScore}>{formatScore(participant.score ?? 0)}</span>
            </button>
          );
        }
        const level = getAttentionLevel(participant);
        const StatusIcon =
          level !== "none"
            ? WarningFilled
            : participant.examStatus === "submitted"
              ? CheckmarkFilled
              : participant.examStatus === "paused" || participant.examStatus === "locked"
                ? PauseFilled
                : InProgress;
        return (
          <button
            key={participant.userId}
            type="button"
            aria-current={selected ? "true" : undefined}
            className={[
              styles.rosterItem,
              selected && styles.rosterItemSelected,
              level === "low" && styles.rosterItemLow,
              level === "medium" && styles.rosterItemMedium,
              level === "high" && styles.rosterItemHigh,
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect(participant.userId)}
          >
            <span className={styles.rosterStatusIcon}>
              <StatusIcon size={16} />
            </span>
            <span className={styles.rosterIdentity}>
              <span className={styles.rosterName}>{getParticipantDisplayName(participant)}</span>
            </span>
            <span className={styles.rosterSignals}>
              {participant.violationCount > 0 ? (
                <span
                  className={`${styles.violationPill} ${
                    level === "high"
                      ? styles.violationPillHigh
                      : level === "medium"
                        ? styles.violationPillMedium
                        : styles.violationPillLow
                  }`}
                >
                  {participant.violationCount}
                </span>
              ) : null}
              <span className={isParticipantLive(participant) ? styles.liveDot : styles.offlineDot} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
