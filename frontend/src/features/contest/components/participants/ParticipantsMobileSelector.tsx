import type { ComponentProps } from "react";
import { Tag } from "@carbon/react";
import { ChevronDown, UserMultiple } from "@carbon/icons-react";

import type { ContestParticipant } from "@/core/entities/contest.entity";
import ParticipantsListPane from "@/features/contest/components/participants/ParticipantsListPane";
import styles from "@/features/contest/components/participants/ContestParticipantsDashboard.module.scss";

type ParticipantsListPaneProps = ComponentProps<typeof ParticipantsListPane>;

interface ParticipantsMobileSelectorProps {
  drawerOpen: boolean;
  selectedDisplayName: string | null;
  selectedParticipant: ContestParticipant | undefined;
  selectedStatusTag: string | null;
  selectedStatusLabel: string | null;
  selectParticipantLabel: string;
  listPaneProps: Omit<ParticipantsListPaneProps, "onSelect">;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  onSelectUser: (userId: string) => void;
}

const ParticipantsMobileSelector = ({
  drawerOpen,
  selectedDisplayName,
  selectedParticipant,
  selectedStatusTag,
  selectedStatusLabel,
  selectParticipantLabel,
  listPaneProps,
  onOpenDrawer,
  onCloseDrawer,
  onSelectUser,
}: ParticipantsMobileSelectorProps) => {
  return (
    <>
      <button
        type="button"
        className={styles.mobileTrigger}
        onClick={onOpenDrawer}
      >
        <UserMultiple size={16} />
        <span className={styles.mobileTriggerLabel}>
          {selectedDisplayName || selectParticipantLabel}
          {selectedParticipant ? (
            <span className={styles.mobileTriggerSub}>
              {" "}@{selectedParticipant.username}
            </span>
          ) : null}
        </span>
        {selectedStatusTag && selectedStatusLabel ? (
          <Tag type={selectedStatusTag as never} size="sm">
            {selectedStatusLabel}
          </Tag>
        ) : null}
        <ChevronDown size={16} />
      </button>

      <div
        className={`${styles.drawerBackdrop} ${drawerOpen ? styles.drawerBackdropOpen : ""}`}
        onClick={onCloseDrawer}
      />

      <aside className={`${styles.drawer} ${drawerOpen ? styles.drawerOpen : ""}`}>
        <ParticipantsListPane
          {...listPaneProps}
          onSelect={(userId) => {
            onSelectUser(userId);
            onCloseDrawer();
          }}
        />
      </aside>
    </>
  );
};

export default ParticipantsMobileSelector;
