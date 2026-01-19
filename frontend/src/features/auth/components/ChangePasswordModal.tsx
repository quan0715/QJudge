import React, { useState } from "react";
import { Modal, TextInput, InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { changePassword } = useUserPreferences();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError(t("preferences.passwordMismatch"));
      return;
    }

    // Validate password length
    if (newPassword.length < 8) {
      setError(t("auth.register.passwordPlaceholder"));
      return;
    }

    setLoading(true);

    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: confirmPassword,
      });

      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      const errorData = err?.response?.data;
      if (errorData?.error?.code === "WRONG_PASSWORD") {
        setError(t("preferences.wrongPassword"));
      } else if (errorData?.error?.code === "OAUTH_USER") {
        setError(t("preferences.oauthUser"));
      } else {
        setError(errorData?.error?.message || t("message.error"));
      }
    } finally {
      setLoading(false);
    }
  };

  const isValid =
    currentPassword &&
    newPassword &&
    confirmPassword &&
    newPassword === confirmPassword;

  return (
    <Modal
      open={isOpen}
      modalHeading={t("preferences.changePassword")}
      primaryButtonText={loading ? t("button.updating") : t("button.confirm")}
      secondaryButtonText={t("button.cancel")}
      onRequestSubmit={handleSubmit}
      onRequestClose={handleClose}
      primaryButtonDisabled={loading || !isValid}
      size="sm"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {success && (
          <InlineNotification
            kind="success"
            title={t("preferences.passwordChanged")}
            lowContrast
            hideCloseButton
          />
        )}

        {error && (
          <InlineNotification
            kind="error"
            title={error}
            lowContrast
            hideCloseButton
          />
        )}

        <TextInput
          id="current-password"
          type="password"
          labelText={t("preferences.currentPassword")}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={loading || success}
        />

        <TextInput
          id="new-password"
          type="password"
          labelText={t("preferences.newPassword")}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={loading || success}
          invalid={newPassword.length > 0 && newPassword.length < 8}
          invalidText="Password must be at least 8 characters"
        />

        <TextInput
          id="confirm-password"
          type="password"
          labelText={t("preferences.confirmPassword")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading || success}
          invalid={
            confirmPassword.length > 0 && newPassword !== confirmPassword
          }
          invalidText={t("preferences.passwordMismatch")}
        />
      </div>
    </Modal>
  );
};

export default ChangePasswordModal;
