import React from "react";
import { AddUserModal } from "./AddUserModal";

interface AddParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (username: string) => Promise<void>;
}

export const AddParticipantModal: React.FC<AddParticipantModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  return (
    <AddUserModal
      role="participant"
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
};
