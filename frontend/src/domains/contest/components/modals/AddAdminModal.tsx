import React, { useState } from 'react';
import { Modal, TextInput } from '@carbon/react';

interface AddAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (username: string) => Promise<void>;
}

export const AddAdminModal: React.FC<AddAdminModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const [username, setUsername] = useState('');
  const [adding, setAdding] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim()) return;

    setAdding(true);
    try {
      await onSubmit(username.trim());
      setUsername('');
      onClose();
    } catch (error) {
      // Error is handled by parent for notification
      throw error;  
    } finally {
      setAdding(false);
    }
  };

  const handleClose = () => {
    setUsername('');
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      modalHeading="新增管理員"
      primaryButtonText={adding ? "新增中..." : "新增"}
      secondaryButtonText="取消"
      onRequestClose={handleClose}
      onRequestSubmit={handleSubmit}
      primaryButtonDisabled={adding || !username.trim()}
    >
      <TextInput
        id="admin-username"
        labelText="用戶名"
        placeholder="輸入用戶名"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        style={{ marginBottom: '1rem' }}
      />
      <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
        管理員可以管理競賽設定、參賽者和題目，但無法新增或移除其他管理員。
      </p>
    </Modal>
  );
};
