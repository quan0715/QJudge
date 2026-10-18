import { useTranslation } from "react-i18next";

import type { AgentState } from "@/core/entities/systemVersion.entity";
import styles from "./AgentStateNote.module.scss";

interface AgentStateNoteProps {
  agent: Exclude<AgentState, "ok">;
  /** What is missing on a deployment that has no host agent, in the page's own words. */
  unsupported: string;
}

/** Explains why a host-agent section is empty, so a missing agent never reads as "all fine". */
const AgentStateNote = ({ agent, unsupported }: AgentStateNoteProps) => {
  const { t } = useTranslation("admin");

  return (
    <p className={styles.note}>
      {agent === "unsupported"
        ? unsupported
        : t("system.overview.agent.unreachable", "無法連線到主機 agent")}
    </p>
  );
};

export default AgentStateNote;
