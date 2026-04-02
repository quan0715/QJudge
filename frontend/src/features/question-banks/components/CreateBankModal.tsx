import { useState } from "react";
import { Modal, Stack, TextInput, Select, SelectItem } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/shared/contexts";
import { create as createQuestionBank } from "@/infrastructure/api/repositories/questionBank.repository";
import type { QuestionBank } from "@/core/entities/question-bank.entity";

interface CreateBankModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (bank: QuestionBank) => void;
}

export const CreateBankModal = ({ open, onClose, onCreated }: CreateBankModalProps) => {
  const { t } = useTranslation("common");
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"coding" | "exam">("coding");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setCategory("coding");
  };

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;

    try {
      setSubmitting(true);
      const bank = await createQuestionBank({
        name: name.trim(),
        description: description.trim(),
        category,
        visibility: "private",
      });
      reset();
      onCreated(bank);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.bankCreated", "題庫已建立"),
      });
    } catch (err: any) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: err?.message || t("message.error"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      modalHeading={t("questionBank.createBank", "建立題庫")}
      primaryButtonText={t("button.create")}
      secondaryButtonText={t("common:button.cancel")}
      onRequestClose={() => {
        reset();
        onClose();
      }}
      onRequestSubmit={() => void handleSubmit()}
      primaryButtonDisabled={!name.trim() || submitting}
    >
      <Stack gap={5}>
        <TextInput
          id="create-bank-name"
          labelText={t("table.title")}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <TextInput
          id="create-bank-description"
          labelText={t("questionBank.description", "描述")}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
        <Select
          id="create-bank-category"
          labelText={t("questionBank.category", "分類")}
          value={category}
          onChange={(e) => setCategory(e.currentTarget.value as "coding" | "exam")}
        >
          <SelectItem value="coding" text={t("questionBank.categoryCoding", "程式題")} />
          <SelectItem value="exam" text={t("questionBank.categoryExam", "考卷題")} />
        </Select>
      </Stack>
    </Modal>
  );
};
