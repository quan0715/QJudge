import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Checkbox,
  ExpandableSearch,
  InlineLoading,
  Modal,
  Select,
  SelectItem,
} from "@carbon/react";
import type { BankQuestion, QuestionBank } from "@/core/entities/question-bank.entity";
import { listMine, listQuestions } from "@/infrastructure/api/repositories/questionBank.repository";
import { getQuestionDisplayTitle } from "@/features/question-banks/screens/questionBankProblemManagement.utils";
import QuestionBankPreviewCard from "@/features/question-banks/components/QuestionBankPreviewCard";
import styles from "./QuestionBankImportModal.module.scss";

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
  onConfirm: (items: BankImportSelectionItem[]) => Promise<void>;
}

const PLACEHOLDER_BANK: QuestionBank = {
  id: "placeholder",
  name: "Question Bank",
  description: "",
  icon: "",
  coverUrl: "",
  category: "exam",
  visibility: "private",
  verified: false,
  reviewStatus: "draft",
  questionCount: 0,
};

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

  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");

  const loadBanks = useCallback(async () => {
    setLoadingBanks(true);
    setError(null);
    try {
      const merged = (await listMine()).filter((bank) => bank.category === category);
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

  const selectedBank = useMemo(
    () => banks.find((bank) => bank.id === selectedBankId) || null,
    [banks, selectedBankId]
  );
  const allVisibleSelected =
    filteredQuestions.length > 0 &&
    filteredQuestions.every((question) => selectedQuestionIds.includes(question.id));

  const toggleQuestion = (id: string, checked: boolean) => {
    setSelectedQuestionIds((prev) =>
      checked ? [...prev, id] : prev.filter((row) => row !== id)
    );
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedQuestionIds((prev) => {
      if (checked) {
        const merged = new Set(prev);
        filteredQuestions.forEach((row) => merged.add(row.id));
        return [...merged];
      }
      const removeIds = new Set(filteredQuestions.map((row) => row.id));
      return prev.filter((id) => !removeIds.has(id));
    });
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
      await onConfirm(payload);
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

          <div className={styles.searchRow}>
            <ExpandableSearch
              id="contest-import-search"
              className={styles.search}
              size="md"
              labelText="Search questions"
              placeholder="Search questions"
              value={keyword}
              onChange={(event) => setKeyword((event.target as HTMLInputElement).value || "")}
            />
          </div>

          <div className={styles.selectionBar}>
            <Checkbox
              id="contest-import-select-all"
              labelText={`Select all visible (${filteredQuestions.length})`}
              checked={allVisibleSelected}
              disabled={filteredQuestions.length === 0}
              onChange={(_, meta) => toggleAllVisible(Boolean(meta.checked))}
            />
            <span className={styles.selectionCount}>Selected: {selectedQuestionIds.length}</span>
          </div>

          <div className={styles.galleryRegion}>
            {loadingQuestions ? (
              <InlineLoading description="Loading questions..." />
            ) : filteredQuestions.length === 0 ? (
              <p className={styles.emptyText}>No question found</p>
            ) : (
              <div className={styles.galleryGrid}>
                {filteredQuestions.map((item) => (
                  <div key={item.id} className={styles.galleryCell}>
                    <QuestionBankPreviewCard
                      question={item}
                      bank={selectedBank || { ...PLACEHOLDER_BANK, id: selectedBankId || PLACEHOLDER_BANK.id }}
                      selected={selectedQuestionIds.includes(item.id)}
                      showSelection
                      iconVariant="neutral"
                      onClick={() => {
                        const checked = !selectedQuestionIds.includes(item.id);
                        toggleQuestion(item.id, checked);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className={styles.errorText}>{error}</p>
          )}
        </>
      )}
    </Modal>
  );
};

export default QuestionBankImportModal;
