import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button, Modal, Tag } from "@carbon/react";
import {
  View,
  Edit,
  OverflowMenuVertical,
  TrashCan,
  Copy,
  ListBoxes,
  Checkmark,
  Code,
} from "@carbon/icons-react";
import { SettingsModal } from "@/shared/ui/modal/SettingsModal";
import { Section, ActionRow } from "@/shared/layout/SettingsPanel";
import { getModalPortalRoot } from "@/shared/ui/theme/portalRoot";
import type { BankQuestion, QuestionBank } from "@/core/entities/question-bank.entity";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import ProblemPreview from "@/shared/ui/problem/ProblemPreview";
import ExamQuestionEditPanel from "@/features/question-banks/components/ExamQuestionEditPanel";
import CodingQuestionEditPanel from "@/features/question-banks/components/CodingQuestionEditPanel";
import { resolveExamQuestionType, toExamQuestion, toBankProblemDetail, getQuestionDisplayTitle } from "./questionBankProblemManagement.utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface QuestionEditModalProps {
  open: boolean;
  question: BankQuestion | null;
  bank: QuestionBank;
  onRequestClose: () => void;
  onDelete: (question: BankQuestion) => Promise<void>;
  onDuplicate: (question: BankQuestion) => Promise<void>;
  onSaved: () => void;
}

// ---------------------------------------------------------------------------
// Correct answer display for exam questions in preview
// ---------------------------------------------------------------------------
const CorrectAnswerSection = ({ question }: { question: BankQuestion }) => {
  const { t } = useTranslation("common");
  const examType = resolveExamQuestionType(question);
  const options = Array.isArray(question.options) ? question.options.map(String) : [];
  const answer = question.correctAnswer;
  const isChoice = examType === "single_choice" || examType === "multiple_choice" || examType === "true_false";

  const resolveIndex = (val: unknown): number => {
    if (typeof val === "boolean") return val ? 0 : 1;
    return Number(val);
  };

  const formatChoiceAnswer = (val: unknown): string => {
    if (Array.isArray(val)) {
      return val.map((i) => { const idx = resolveIndex(i); return `${String.fromCharCode(65 + idx)}. ${options[idx] ?? ""}`; }).join(", ");
    }
    const i = resolveIndex(val);
    return `${String.fromCharCode(65 + i)}. ${options[i] ?? ""}`;
  };

  const hasAnswer = answer != null && (typeof answer !== "string" || answer.length > 0);

  return (
    <div style={{ marginTop: "1rem", borderLeft: "3px solid var(--cds-support-info)", paddingLeft: "0.75rem" }}>
      <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--cds-text-secondary)", letterSpacing: "0.02em", textTransform: "uppercase" as const }}>
        {t("questionBank.correctAnswer", "正確答案")}
      </span>
      <div style={{ fontSize: "0.875rem", marginTop: "0.25rem", fontWeight: 500, color: hasAnswer ? "var(--cds-support-success)" : "var(--cds-text-helper)" }}>
        {!hasAnswer
          ? t("questionBank.noCorrectAnswer", "尚未設定正確答案")
          : isChoice
            ? formatChoiceAnswer(answer)
            : <MarkdownRenderer>{String(answer)}</MarkdownRenderer>}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Preview Panel — show question content + correct answer (no answer input)
// ---------------------------------------------------------------------------
const QuestionPreviewPanel = ({ question, bank }: { question: BankQuestion; bank: QuestionBank }) => {
  const { t } = useTranslation(["common", "contest"]);

  if (question.questionType === "exam") {
    const examQ = toExamQuestion(bank.id, question);
    return (
      <div style={{ maxWidth: 720 }}>
        {/* Header: index + type tag + score */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
          <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {t("contest:answering.submit.questionPreview", { index: Number(question.order || 0) + 1 })}
            <Tag size="sm" type={TYPE_COLOR[resolveExamQuestionType(question)] as never}>
              {t(`common:questionType.label.${resolveExamQuestionType(question)}`)}
            </Tag>
          </span>
          <span style={{ fontSize: "0.875rem", color: "var(--cds-text-helper)" }}>
            {examQ.score} {t("contest:scoreboard.status.pts")}
          </span>
        </div>

        {/* Prompt */}
        {examQ.prompt && (
          <div style={{ marginBottom: "1.5rem", fontSize: "1.125rem", lineHeight: 1.8 }}>
            <MarkdownRenderer enableHighlight enableCopy>{examQ.prompt}</MarkdownRenderer>
          </div>
        )}

        {/* Correct answer */}
        <CorrectAnswerSection question={question} />
      </div>
    );
  }

  return <ProblemPreview problem={toBankProblemDetail(question)} compact />;
};

const TYPE_COLOR: Record<string, string> = {
  true_false: "teal",
  single_choice: "blue",
  multiple_choice: "purple",
  short_answer: "cyan",
  essay: "magenta",
};

// ---------------------------------------------------------------------------
// Actions Panel — delete, duplicate, contest usages
// ---------------------------------------------------------------------------
const QuestionActionsPanel = ({
  question,
  onDelete,
  onDuplicate,
}: {
  question: BankQuestion;
  onDelete: () => void;
  onDuplicate: () => void;
}) => {
  const { t } = useTranslation("common");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  const usages = question.contestUsages ?? [];

  return (
    <>
      <Section title={t("questionBank.actions", "操作")}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Button
            kind="tertiary"
            size="md"
            renderIcon={Copy}
            onClick={() => setConfirmDuplicate(true)}
          >
            {t("questionBank.duplicateQuestion", "複製題目")}
          </Button>

          <Button
            kind="danger--tertiary"
            size="md"
            renderIcon={TrashCan}
            onClick={() => setConfirmDelete(true)}
          >
            {t("questionBank.deleteQuestion", "刪除題目")}
          </Button>
        </div>
      </Section>

      {usages.length > 0 && (
        <Section title={t("questionBank.contestUsages", "所在競賽")}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {usages.map((u) => (
              <ActionRow key={u.contestId} label={u.contestName}>
                <Tag type="cool-gray" size="sm" renderIcon={ListBoxes}>
                  {u.contestId.slice(0, 8)}
                </Tag>
              </ActionRow>
            ))}
          </div>
        </Section>
      )}

      <Section title={t("questionBank.questionInfo", "題目資訊")}>
        {question.sourceBankName && (
          <ActionRow label={t("questionBank.source", "來源")}>
            <span>{question.sourceBankName}</span>
          </ActionRow>
        )}
        <ActionRow label={t("questionBank.createdAt", "建立時間")}>
          <span>{question.createdAt ? new Date(question.createdAt).toLocaleString() : "—"}</span>
        </ActionRow>
        <ActionRow label={t("questionBank.updatedAt", "更新時間")}>
          <span>{question.updatedAt ? new Date(question.updatedAt).toLocaleString() : "—"}</span>
        </ActionRow>
      </Section>

      {/* Confirm Delete — portaled to avoid double-modal stacking */}
      {createPortal(
        <Modal
          open={confirmDelete}
          danger
          modalHeading={t("questionBank.confirmDelete", "確認刪除？")}
          primaryButtonText={t("button.delete", "刪除")}
          secondaryButtonText={t("button.cancel", "取消")}
          onRequestClose={() => setConfirmDelete(false)}
          onRequestSubmit={() => { setConfirmDelete(false); onDelete(); }}
          size="xs"
        >
          <p>{t("questionBank.confirmDeleteDesc", "此操作無法復原")}</p>
        </Modal>,
        getModalPortalRoot(),
      )}

      {/* Confirm Duplicate — portaled to avoid double-modal stacking */}
      {createPortal(
        <Modal
          open={confirmDuplicate}
          modalHeading={t("questionBank.confirmDuplicate", "確認複製？")}
          primaryButtonText={t("questionBank.duplicateQuestion", "複製題目")}
          secondaryButtonText={t("button.cancel", "取消")}
          onRequestClose={() => setConfirmDuplicate(false)}
          onRequestSubmit={() => { setConfirmDuplicate(false); onDuplicate(); }}
          size="xs"
        >
          <p>{t("questionBank.confirmDuplicateDesc", "將複製此題目到目前的題庫中")}</p>
        </Modal>,
        getModalPortalRoot(),
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Main: QuestionEditModal (SettingsModal with 3 tabs)
// ---------------------------------------------------------------------------
const QuestionEditModal = ({
  open,
  question,
  bank,
  onRequestClose,
  onDelete,
  onDuplicate,
  onSaved,
}: QuestionEditModalProps) => {
  const { t } = useTranslation("common");

  const isCoding = question?.questionType === "coding";

  const navItems = useMemo(() => {
    const base = [
      { id: "preview", label: t("questionBank.tabPreview", "預覽"), icon: View },
      { id: "edit", label: t("questionBank.tabEdit", "編輯"), icon: Edit },
    ];
    if (isCoding) {
      base.push(
        { id: "validation", label: t("questionBank.tabValidation", "驗證規則"), icon: Checkmark },
        { id: "languages", label: t("questionBank.tabLanguages", "語言設定"), icon: Code },
      );
    }
    base.push({ id: "actions", label: t("questionBank.tabActions", "其他"), icon: OverflowMenuVertical });
    return base;
  }, [t, isCoding]);

  if (!question) return null;

  const isExam = question.questionType === "exam";
  const examType = isExam ? resolveExamQuestionType(question) : null;
  const heading = isExam
    ? `#${Number(question.order || 0) + 1} · ${t(`questionType.label.${examType}`, examType || "")}`
    : getQuestionDisplayTitle(question);

  return (
    <SettingsModal
      open={open}
      onRequestClose={onRequestClose}
      modalHeading={heading}
      navItems={navItems}
      initialActiveId="preview"
      renderPanel={(activeId) => {
        if (activeId === "preview") {
          return <QuestionPreviewPanel question={question} bank={bank} />;
        }

        if (activeId === "edit") {
          return isExam
            ? <ExamQuestionEditPanel bankId={bank.id} question={question} onSaved={onSaved} />
            : <CodingQuestionEditPanel bankId={bank.id} question={question} onSaved={onSaved} activeTab="edit" />;
        }

        if (activeId === "validation" && isCoding) {
          return <CodingQuestionEditPanel bankId={bank.id} question={question} onSaved={onSaved} activeTab="validation" />;
        }

        if (activeId === "languages" && isCoding) {
          return <CodingQuestionEditPanel bankId={bank.id} question={question} onSaved={onSaved} activeTab="languages" />;
        }

        if (activeId === "actions") {
          return (
            <QuestionActionsPanel
              question={question}
              onDelete={() => void onDelete(question)}
              onDuplicate={() => void onDuplicate(question)}
            />
          );
        }

        return null;
      }}
    />
  );
};

export default QuestionEditModal;
