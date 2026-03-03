import React from "react";
import { AddUserModal } from "./AddUserModal";

interface AddAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (username: string) => Promise<void>;
}

export const AddAdminModal: React.FC<AddAdminModalProps> = ({
  isOpen, onClose, onSubmit,
}) => {
  return (
    <AddUserModal
      role="admin"
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
};
