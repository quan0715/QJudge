import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Loading,
  Modal,
  Tile,
} from "@carbon/react";
import type { ExamQuestionType } from "@/core/entities/contest.entity";
import type { BankQuestion, QuestionBank } from "@/core/entities/question-bank.entity";
import { createQuestion } from "@/infrastructure/api/repositories/questionBank.repository";
import type { ExamQuestionUpsertPayload } from "@/infrastructure/api/repositories/examQuestions.repository";
import { useToast } from "@/shared/contexts";
import { EXAM_QUESTION_TYPE_ICON as QUESTION_TYPE_ICONS } from "@/shared/ui/examQuestionTypeVisual";
import QuestionBankPreviewCard from "@/features/question-banks/components/QuestionBankPreviewCard";
import {
  filterAndSortQuestions,
  toExamBankPayload,
  type QuestionFilterState,
} from "./questionBankProblemManagement.utils";
import styles from "./QuestionBankProblemManagementPanel.module.scss";

const EXAM_DEFAULT_PAYLOADS: Record<ExamQuestionType, Omit<ExamQuestionUpsertPayload, "order">> = {
  single_choice: {
    question_type: "single_choice",
    prompt: "New question",
    score: 5,
    options: ["Option A", "Option B"],
    correct_answer: 0,
  },
  multiple_choice: {
    question_type: "multiple_choice",
    prompt: "New question",
    score: 5,
    options: ["Option A", "Option B"],
    correct_answer: [0],
  },
  true_false: {
    question_type: "true_false",
    prompt: "New question",
    score: 5,
    options: ["True", "False"],
    correct_answer: true,
  },
  short_answer: { question_type: "short_answer", prompt: "New question", score: 5 },
  essay: { question_type: "essay", prompt: "New question", score: 5 },
};

const QUESTION_TYPE_ORDER: ExamQuestionType[] = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "short_answer",
  "essay",
];

interface QuestionBankProblemManagementPanelProps {
  bank: QuestionBank;
  questions: BankQuestion[];
  loading?: boolean;
  onReload: () => Promise<void>;
  onCardClick?: (question: BankQuestion) => void;
  onQuestionCreated?: (question: BankQuestion) => void;
  filterState: QuestionFilterState;
  examTypePickerOpen?: boolean;
  onExamTypePickerClose?: () => void;
}

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const QuestionBankProblemManagementPanel = ({
  bank,
  questions,
  loading = false,
  onReload,
  onCardClick,
  onQuestionCreated,
  filterState,
  examTypePickerOpen = false,
  onExamTypePickerClose,
}: QuestionBankProblemManagementPanelProps) => {
  const { t } = useTranslation("common");
  const { showToast } = useToast();

  const filteredQuestions = useMemo(
    () => filterAndSortQuestions(questions, filterState),
    [questions, filterState]
  );

  const handleCreateExamQuestion = async (questionType: ExamQuestionType) => {
    const maxOrder =
      questions.length === 0 ? 0 : Math.max(...questions.map((row) => Number(row.order || 0))) + 1;
    const payload = toExamBankPayload({ ...EXAM_DEFAULT_PAYLOADS[questionType], order: maxOrder });

    try {
      onExamTypePickerClose?.();
      const created = await createQuestion(bank.id, payload);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.questionCreated", "題目已建立"),
      });
      await onReload();
      onQuestionCreated?.(created);
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    }
  };

  if (loading && questions.length === 0) {
    return (
      <div className={styles.loadingWrap}>
        <Loading withOverlay={false} description={t("message.loading", "載入中")} />
      </div>
    );
  }

  return (
    <>
      <div className={styles.galleryRoot}>
        {filteredQuestions.length === 0 ? (
          <Tile>
            <p className={styles.emptyText}>{t("message.noData", "暫無資料")}</p>
          </Tile>
        ) : (
          <div className={styles.galleryGrid}>
            {filteredQuestions.map((question) => (
              <div key={question.bankItemId} className={styles.galleryCell}>
                <QuestionBankPreviewCard
                  bank={bank}
                  question={question}
                  onClick={() => onCardClick?.(question)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <ExamTypePickerModal
        open={examTypePickerOpen}
        onClose={() => onExamTypePickerClose?.()}
        onSelect={handleCreateExamQuestion}
      />
    </>
  );
};

const ExamTypePickerModal = ({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (questionType: ExamQuestionType) => void;
}) => {
  const { t } = useTranslation("common");
  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      modalHeading={t("examEditor.selectQuestionType", "選擇題目類型")}
      passiveModal
      size="sm"
    >
      <div className={styles.typePickerGrid}>
        {QUESTION_TYPE_ORDER.map((questionType) => {
          const Icon = QUESTION_TYPE_ICONS[questionType];
          return (
            <button
              key={questionType}
              type="button"
              className={styles.typePickerCard}
              onClick={() => onSelect(questionType)}
            >
              <Icon size={24} />
              <div className={styles.typePickerInfo}>
                <span className={styles.typePickerLabel}>
                  {t(`questionType.label.${questionType}`, questionType)}
                </span>
                <span className={styles.typePickerDesc}>
                  {t(`questionType.description.${questionType}`, "")}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
};

export default QuestionBankProblemManagementPanel;
