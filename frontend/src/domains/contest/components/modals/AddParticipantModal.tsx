import React, { useState } from 'react';
import { Modal, TextInput } from '@carbon/react';

interface AddParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (username: string) => Promise<void>;
}

export const AddParticipantModal: React.FC<AddParticipantModalProps> = ({ 
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
      await onSubmit(username);
      setUsername('');
      onClose(); // Close on success
    } catch (error) {
      // Error handling is done by parent for notification
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
      modalHeading="新增參賽者"
      primaryButtonText={adding ? "新增中..." : "新增"}
      secondaryButtonText="取消"
      onRequestSubmit={handleSubmit}
      onRequestClose={handleClose}
      primaryButtonDisabled={adding || !username}
    >
      <TextInput
        id="username"
        labelText="使用者名稱 (Username)"
        placeholder="輸入要加入的使用者名稱"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
    </Modal>
  );
};
