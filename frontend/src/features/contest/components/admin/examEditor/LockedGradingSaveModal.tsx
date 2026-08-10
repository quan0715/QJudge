import {
  Button,
  ComposedModal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@carbon/react";
import { useTranslation } from "react-i18next";

import type {
  ExistingGradesAction,
  LockedSaveImpact,
} from "./lockedQuestionSaveImpact";

interface LockedGradingSaveModalProps {
  open: boolean;
  impact: LockedSaveImpact;
  resultsPublished: boolean;
  submitting: boolean;
  onCancel: () => void;
  onChoose: (action: ExistingGradesAction) => void;
}

const LockedGradingSaveModal = ({
  open,
  impact,
  resultsPublished,
  submitting,
  onCancel,
  onChoose,
}: LockedGradingSaveModalProps) => {
  const { t } = useTranslation("contest");
  const subjective = impact.kind === "subjective-review";
  const objective = impact.kind === "objective-regrade";

  const heading = objective
    ? t("examEditor.lockedSave.objectiveTitle", "更新評分規則並重新批改？")
    : subjective
      ? t("examEditor.lockedSave.subjectiveTitle", "如何處理已批改作答？")
      : t("examEditor.lockedSave.displayTitle", "儲存顯示內容變更？");

  return (
    <ComposedModal open={open} onClose={onCancel} size="sm">
      <ModalHeader title={heading} closeModal={onCancel} />
      <ModalBody>
        {objective ? (
          <p>
            <strong>{impact.affectedCount}</strong>{" "}
            {t("examEditor.lockedSave.objectiveBody", "份作答將依新規則重新批改。")}
          </p>
        ) : null}
        {subjective ? (
          <p>
            <strong>{impact.affectedCount}</strong>{" "}
            {t("examEditor.lockedSave.subjectiveBody", "份既有批改，請選擇保留或改為待批改。")}
          </p>
        ) : null}
        {impact.kind === "display-only" ? (
          <p>{t("examEditor.lockedSave.displayBody", "詳解變更會立即套用至已發布的成績頁。")}</p>
        ) : null}
        {resultsPublished && (objective || subjective) ? (
          <p>{t("examEditor.lockedSave.unpublishNotice", "此操作可能取消目前的成績發布狀態。")}</p>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onCancel} disabled={submitting}>
          {t("button.cancel", "取消")}
        </Button>
        {subjective ? (
          <>
            <Button
              kind="tertiary"
              onClick={() => onChoose("keep")}
              disabled={submitting}
            >
              {t("examEditor.lockedSave.keep", "保留既有批改")}
            </Button>
            <Button
              kind="primary"
              onClick={() => onChoose("mark_pending")}
              disabled={submitting}
            >
              {t("examEditor.lockedSave.markPending", "標記為待批改")}
            </Button>
          </>
        ) : (
          <Button
            kind="primary"
            onClick={() => onChoose(objective ? "regrade" : "keep")}
            disabled={submitting}
          >
            {objective
              ? t("examEditor.lockedSave.regrade", "重新批改")
              : t("button.save", "儲存")}
          </Button>
        )}
      </ModalFooter>
    </ComposedModal>
  );
};

export default LockedGradingSaveModal;
