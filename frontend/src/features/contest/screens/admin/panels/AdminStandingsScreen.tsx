import { useSearchParams } from "react-router-dom";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import ContestStandingsScreen from "@/features/contest/screens/ContestStandingsScreen";
import styles from "./AdminStandingsPanel.module.scss";

export default function AdminStandingsScreen({
  embedded = false,
}: AdminPanelProps & { embedded?: boolean }) {
  const [, setSearchParams] = useSearchParams();
  const openParticipant = (userId: string, problemId?: string) =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("panel", "participants");
      next.set("user", userId);
      next.delete("tab");
      if (problemId) next.set("problem", problemId);
      else next.delete("problem");
      return next;
    });
  return (
    <div className={embedded ? undefined : styles.root}>
      <div className={embedded ? undefined : styles.inner}>
        <ContestStandingsScreen
          titleSize={embedded ? "section" : "page"}
          fill={!embedded}
          onSelectParticipant={openParticipant}
        />
      </div>
    </div>
  );
}
