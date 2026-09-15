import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import ContestStandingsScreen from "@/features/contest/screens/ContestStandingsScreen";
import ParticipantDrawer from "@/features/contest/components/participants/ParticipantDrawer";
import styles from "./AdminStandingsPanel.module.scss";

export default function AdminStandingsScreen({
  contestId,
  embedded = false,
}: AdminPanelProps & { embedded?: boolean }) {
  const [, setSearchParams] = useSearchParams();
  const [selection, setSelection] = useState<{ userId: string; problemId?: string } | null>(null);
  return (
    <>
      <div className={embedded ? undefined : styles.root}>
        <div className={embedded ? undefined : styles.inner}>
          <ContestStandingsScreen
            titleSize={embedded ? "section" : "page"}
            fill={!embedded}
            onSelectParticipant={(userId, problemId) => setSelection({ userId, problemId })}
          />
        </div>
      </div>
      {selection ? (
        <ParticipantDrawer
          key={`${selection.userId}:${selection.problemId || "all"}`}
          contestId={contestId}
          selectedUserId={selection.userId}
          initialDetail={selection.problemId ? "submissions" : "overview"}
          initialExpandedProblemId={selection.problemId}
          onClose={() => setSelection(null)}
          onOpenPanel={(panel) => setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            next.set("panel", panel);
            if (panel === "proctoring") next.set("user", selection.userId);
            return next;
          })}
        />
      ) : null}
    </>
  );
}
