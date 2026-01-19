import React, { useState } from "react";
import {
  Modal,
  TextInput,
  TextArea,
  RadioButton,
  RadioButtonGroup,
  InlineNotification,
  Stack,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { createContest } from "@/infrastructure/api/repositories";

interface ContestCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const ContestCreateModal: React.FC<ContestCreateModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setName("");
    setDescription("");
    setRules("");
    setVisibility("public");
    setPassword("");
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(t("create.nameRequired"));
      return;
    }

    if (visibility === "private" && !password.trim()) {
      setError(t("create.passwordRequired"));
      return;
    }

    setCreating(true);
    setError("");

    try {
      const now = new Date();
      const startTime = new Date(now);
      startTime.setDate(startTime.getDate() + 1); // Tomorrow
      const endTime = new Date(startTime.getTime() + 4 * 60 * 60 * 1000); // +4 hours

      const contest = await createContest({
        name: name.trim(),
        description: description.trim(),
        rules: rules.trim(),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        visibility,
        password: visibility === "private" ? password : undefined,
      });

      resetForm();
      onClose();
      onSuccess?.();
      navigate(`/contests/${contest.id}?tab=settings`);
    } catch (err: any) {
      setError(err.message || t("create.failed"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      modalHeading={t("create.title")}
      primaryButtonText={creating ? t("create.creating") : t("create.submit")}
      secondaryButtonText={tc("button.cancel")}
      onRequestClose={handleClose}
      onRequestSubmit={handleSubmit}
      primaryButtonDisabled={creating}
    >
      <Stack gap={5}>
        {error && (
          <InlineNotification
            kind="error"
            title={tc("message.error")}
            subtitle={error}
            onClose={() => setError("")}
            lowContrast
          />
        )}

        <InlineNotification
          kind="info"
          title={t("create.hint")}
          subtitle={t("create.hintDetail")}
          lowContrast
          hideCloseButton
        />

        <TextInput
          id="contest-name"
          labelText={t("create.name")}
          placeholder={t("create.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <TextInput
          id="contest-description"
          labelText={t("create.description")}
          placeholder={t("create.descriptionPlaceholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <TextArea
          id="contest-rules"
          labelText={t("create.rules")}
          placeholder={t("create.rulesPlaceholder")}
          value={rules}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setRules(e.target.value)
          }
          rows={3}
        />

        <RadioButtonGroup
          legendText={t("create.visibility")}
          name="visibility"
          defaultSelected={visibility}
          onChange={(value) => setVisibility(value as "public" | "private")}
        >
          <RadioButton
            id="visibility-public"
            labelText={t("create.visibilityPublic")}
            value="public"
          />
          <RadioButton
            id="visibility-private"
            labelText={t("create.visibilityPrivate")}
            value="private"
          />
        </RadioButtonGroup>

        {visibility === "private" && (
          <TextInput
            id="contest-password"
            labelText={t("create.password")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("create.passwordPlaceholder")}
            autoComplete="new-password"
          />
        )}
      </Stack>
    </Modal>
  );
};

export default ContestCreateModal;
