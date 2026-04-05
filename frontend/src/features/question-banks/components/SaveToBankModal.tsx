import { useEffect, useState } from "react";
import { Loading, Modal, Select, SelectItem, Stack } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/shared/contexts";
import type { QuestionBank, QuestionInboxSourceType } from "@/core/entities/question-bank.entity";
import {
  ingestInbox,
  listMine,
} from "@/infrastructure/api/repositories/questionBank.repository";

interface SaveToBankModalProps {
  open: boolean;
  onClose: () => void;
  sourceType: QuestionInboxSourceType;
  sourceId: string;
  sourceTitle: string;
  onSaved?: () => void;
}

export const SaveToBankModal = ({
  open,
  onClose,
  sourceType,
  sourceId,
  sourceTitle,
  onSaved,
}: SaveToBankModalProps) => {
  const { t } = useTranslation("common");
  const { showToast } = useToast();

  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetBankId, setTargetBankId] = useState("");
  const [saving, setSaving] = useState(false);

  const category = sourceType === "problem" ? "coding" : "exam";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      try {
        const mine = await listMine();
        const filtered = mine.filter((b) => b.category === category);
        if (!cancelled) {
          setBanks(filtered);
          setTargetBankId(filtered[0]?.id || "");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetch();
    return () => { cancelled = true; };
  }, [open, category]);

  const handleSave = async () => {
    if (!targetBankId || saving) return;
    try {
      setSaving(true);
      await ingestInbox({
        targetBankId,
        items: [{ sourceType, sourceId }],
      });
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.saveToBank.success", "已收錄到題庫"),
      });
      onSaved?.();
      onClose();
    } catch (err: any) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: err?.message || t("message.error"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      data-testid="save-to-bank-modal"
      modalHeading={t("questionBank.saveToBank.title", "收錄到題庫")}
      primaryButtonText={saving ? t("message.loading", "載入中") : t("button.confirm", "確認")}
      secondaryButtonText={t("common:button.cancel")}
      onRequestClose={onClose}
      onRequestSubmit={() => void handleSave()}
      primaryButtonDisabled={!targetBankId || saving}
      size="sm"
    >
      {loading ? (
        <Loading withOverlay={false} />
      ) : (
        <Stack gap={4}>
          <p>{t("questionBank.saveToBank.desc", "將「{{title}}」收錄到題庫：").replace("{{title}}", sourceTitle)}</p>
          <Select
            id="save-to-bank-target"
            labelText={t("questionBank.selectTargetBank", "選擇目標題庫")}
            value={targetBankId}
            onChange={(e) => setTargetBankId(e.currentTarget.value)}
          >
            {banks.length === 0 ? (
              <SelectItem value="" text={t("questionBank.noBank", "尚無題庫")} />
            ) : (
              banks.map((b) => (
                <SelectItem key={b.id} value={b.id} text={b.name} />
              ))
            )}
          </Select>
        </Stack>
      )}
    </Modal>
  );
};
