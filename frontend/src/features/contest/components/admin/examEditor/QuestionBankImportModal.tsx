import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Checkbox,
  InlineLoading,
  Modal,
  RadioButton,
  RadioButtonGroup,
  Select,
  SelectItem,
  TextInput,
} from "@carbon/react";
import type { BankQuestion, ExploreBankItem, QuestionBank } from "@/core/entities/question-bank.entity";
import { listExplore, listMine, listQuestions } from "@/infrastructure/api/repositories/questionBank.repository";
import { getQuestionDisplayTitle } from "@/features/question-banks/screens/questionBankProblemManagement.utils";

export interface BankImportSelectionItem {
  questionBankId: string;
  questionId: string;
  title: string;
  questionType?: "coding" | "exam";
  prompt?: string;
  options?: unknown[];
  correctAnswer?: unknown;
  score?: number;
  metadata?: Record<string, unknown>;
}

interface QuestionBankImportModalProps {
  open: boolean;
  category: "coding" | "exam";
  onClose: () => void;
  onConfirm: (
    items: BankImportSelectionItem[],
    importMode: "copy" | "reference"
  ) => Promise<void>;
}

const QuestionBankImportModal: React.FC<QuestionBankImportModalProps> = ({
  open,
  category,
  onClose,
  onConfirm,
}) => {
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [banks, setBanks] = useState<Array<QuestionBank | ExploreBankItem>>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [importMode, setImportMode] = useState<"copy" | "reference">("copy");

  const loadBanks = useCallback(async () => {
    setLoadingBanks(true);
    setError(null);
    try {
      const [mine, explore] = await Promise.all([listMine(), listExplore()]);
      const merged = [...mine, ...explore].filter((bank) => bank.category === category);
      setBanks(merged);
      if (merged.length > 0) {
        setSelectedBankId((prev) => prev || merged[0].id);
      } else {
        setSelectedBankId("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load question banks");
    } finally {
      setLoadingBanks(false);
    }
  }, [category]);

  const loadQuestions = useCallback(async (bankId: string) => {
    if (!bankId) {
      setQuestions([]);
      return;
    }
    setLoadingQuestions(true);
    setError(null);
    try {
      const rows = await listQuestions(bankId);
      const normalized = rows.filter((q) => q.questionType === category);
      setQuestions(normalized);
      setSelectedQuestionIds([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bank questions");
    } finally {
      setLoadingQuestions(false);
    }
  }, [category]);

  useEffect(() => {
    if (!open) return;
    void loadBanks();
  }, [loadBanks, open]);

  useEffect(() => {
    if (!open) return;
    if (!selectedBankId) return;
    void loadQuestions(selectedBankId);
  }, [loadQuestions, open, selectedBankId]);

  const filteredQuestions = useMemo(() => {
    const keywordLower = keyword.trim().toLowerCase();
    if (!keywordLower) return questions;
    return questions.filter((item) => {
      const title = item.title?.toLowerCase() || "";
      const prompt = item.prompt?.toLowerCase() || "";
      return title.includes(keywordLower) || prompt.includes(keywordLower);
    });
  }, [keyword, questions]);

  const toggleQuestion = (id: string, checked: boolean) => {
    setSelectedQuestionIds((prev) =>
      checked ? [...prev, id] : prev.filter((row) => row !== id)
    );
  };

  const handleConfirm = async () => {
    if (!selectedBankId || selectedQuestionIds.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const itemMap = new Map(questions.map((q) => [q.id, q]));
      const payload: BankImportSelectionItem[] = [];
      for (const id of selectedQuestionIds) {
        const question = itemMap.get(id);
        if (!question) continue;
        payload.push({
          questionBankId: selectedBankId,
          questionId: id,
          title: getQuestionDisplayTitle(question),
          questionType: question.questionType,
          prompt: question.prompt || "",
          options: question.options || [],
          correctAnswer: question.correctAnswer,
          score: question.score,
          metadata:
            question.metadata && typeof question.metadata === "object"
              ? question.metadata
              : undefined,
        });
      }
      await onConfirm(payload, importMode);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import questions");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      modalHeading="Import from Question Bank"
      primaryButtonText={submitting ? "Importing..." : "Import Selected"}
      secondaryButtonText="Cancel"
      onRequestClose={onClose}
      onRequestSubmit={() => {
        void handleConfirm();
      }}
      primaryButtonDisabled={submitting || loadingQuestions || selectedQuestionIds.length === 0}
      size="md"
    >
      {loadingBanks ? (
        <InlineLoading description="Loading banks..." />
      ) : (
        <>
          <Select
            id="contest-import-bank-select"
            labelText="Question bank"
            value={selectedBankId}
            onChange={(event) => setSelectedBankId(event.target.value)}
          >
            {banks.length === 0 ? (
              <SelectItem value="" text="No bank available" />
            ) : (
              banks.map((bank) => (
                <SelectItem
                  key={bank.id}
                  value={bank.id}
                  text={bank.ownerUsername ? `${bank.name} (${bank.ownerUsername})` : bank.name}
                />
              ))
            )}
          </Select>

          <div style={{ marginTop: "0.75rem" }}>
            <RadioButtonGroup
              legendText="Import mode"
              name="contest-import-mode"
              valueSelected={importMode}
              onChange={(value) => setImportMode(value as "copy" | "reference")}
            >
              <RadioButton labelText="Copy" value="copy" id="contest-import-mode-copy" />
              <RadioButton labelText="Reference" value="reference" id="contest-import-mode-reference" />
            </RadioButtonGroup>
          </div>

          <div style={{ marginTop: "0.75rem" }}>
            <TextInput
              id="contest-import-search"
              labelText="Search questions"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>

          <div
            style={{
              marginTop: "0.75rem",
              border: "1px solid var(--cds-border-subtle-01)",
              maxHeight: "18rem",
              overflow: "auto",
              padding: "0.5rem",
            }}
          >
            {loadingQuestions ? (
              <InlineLoading description="Loading questions..." />
            ) : filteredQuestions.length === 0 ? (
              <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>No question found</p>
            ) : (
              filteredQuestions.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "0.375rem 0.25rem",
                    borderBottom: "1px solid var(--cds-border-subtle-01)",
                  }}
                >
                  <Checkbox
                    id={`contest-import-q-${item.id}`}
                    labelText={getQuestionDisplayTitle(item)}
                    checked={selectedQuestionIds.includes(item.id)}
                    onChange={(_, meta) => toggleQuestion(item.id, Boolean(meta.checked))}
                  />
                </div>
              ))
            )}
          </div>

          {error && (
            <p style={{ marginTop: "0.75rem", color: "var(--cds-support-error)" }}>{error}</p>
          )}
        </>
      )}
    </Modal>
  );
};

export default QuestionBankImportModal;
