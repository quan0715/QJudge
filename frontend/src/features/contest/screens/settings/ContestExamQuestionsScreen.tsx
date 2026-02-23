import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Button,
  InlineNotification,
  Modal,
  MultiSelect,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextArea,
  TextInput,
} from "@carbon/react";
import {
  Add,
  ArrowDown,
  ArrowUp,
  Edit,
  Renew,
  TrashCan,
} from "@carbon/icons-react";

import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import {
  createExamQuestion,
  deleteExamQuestion,
  getExamQuestions,
  reorderExamQuestions,
  type ExamQuestionUpsertPayload,
  updateExamQuestion,
} from "@/infrastructure/api/repositories";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import ContainerCard from "@/shared/layout/ContainerCard";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";

interface QuestionFormState {
  questionType: ExamQuestionType;
  prompt: string;
  score: string;
  options: string[];
  singleAnswerIndex: string;
  multiAnswerIndexes: string[];
  essayReferenceAnswer: string;
}

const TYPE_LABEL: Record<ExamQuestionType, string> = {
  true_false: "是非題",
  single_choice: "單選題",
  multiple_choice: "多選題",
  essay: "問答題",
};

const getDefaultOptions = (type: ExamQuestionType): string[] => {
  if (type === "true_false") {
    return ["是", "否"];
  }
  if (type === "essay") {
    return [];
  }
  return ["", ""];
};

const createInitialForm = (type: ExamQuestionType = "single_choice"): QuestionFormState => ({
  questionType: type,
  prompt: "",
  score: "5",
  options: getDefaultOptions(type),
  singleAnswerIndex: "",
  multiAnswerIndexes: [],
  essayReferenceAnswer: "",
});

const isObjectiveType = (type: ExamQuestionType) => type !== "essay";

const toSingleAnswerIndex = (
  value: unknown,
  options: string[],
  questionType: ExamQuestionType
): string => {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "0" : "1";
  }

  if (typeof value === "string") {
    const lowered = value.toLowerCase().trim();
    if (questionType === "true_false") {
      if (lowered === "true") return "0";
      if (lowered === "false") return "1";
    }

    const asNumber = Number(value);
    if (!Number.isNaN(asNumber) && Number.isInteger(asNumber)) {
      return String(asNumber);
    }

    const matchingIndex = options.findIndex((option) => option === value);
    if (matchingIndex >= 0) {
      return String(matchingIndex);
    }
  }

  return "";
};

const toMultiAnswerIndexes = (value: unknown, options: string[]): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "number" && Number.isInteger(item)) {
        return String(item);
      }

      if (typeof item === "string") {
        const asNumber = Number(item);
        if (!Number.isNaN(asNumber) && Number.isInteger(asNumber)) {
          return String(asNumber);
        }

        const matchingIndex = options.findIndex((option) => option === item);
        if (matchingIndex >= 0) {
          return String(matchingIndex);
        }
      }

      return "";
    })
    .filter(Boolean);
};

const toFormState = (question: ExamQuestion): QuestionFormState => {
  const options = question.options || [];

  if (question.questionType === "multiple_choice") {
    return {
      questionType: question.questionType,
      prompt: question.prompt,
      score: String(question.score || 0),
      options,
      singleAnswerIndex: "",
      multiAnswerIndexes: toMultiAnswerIndexes(question.correctAnswer, options),
      essayReferenceAnswer: "",
    };
  }

  if (question.questionType === "essay") {
    return {
      questionType: question.questionType,
      prompt: question.prompt,
      score: String(question.score || 0),
      options: [],
      singleAnswerIndex: "",
      multiAnswerIndexes: [],
      essayReferenceAnswer:
        typeof question.correctAnswer === "string"
          ? question.correctAnswer
          : question.correctAnswer === null || question.correctAnswer === undefined
            ? ""
            : JSON.stringify(question.correctAnswer),
    };
  }

  return {
    questionType: question.questionType,
    prompt: question.prompt,
    score: String(question.score || 0),
    options,
    singleAnswerIndex: toSingleAnswerIndex(
      question.correctAnswer,
      options,
      question.questionType
    ),
    multiAnswerIndexes: [],
    essayReferenceAnswer: "",
  };
};

const buildPayload = (form: QuestionFormState): ExamQuestionUpsertPayload => {
  const payload: ExamQuestionUpsertPayload = {
    question_type: form.questionType,
    prompt: form.prompt.trim(),
    score: Number(form.score || 0),
  };

  if (form.questionType === "essay") {
    if (form.essayReferenceAnswer.trim()) {
      payload.correct_answer = form.essayReferenceAnswer.trim();
    }
    return payload;
  }

  const options = form.options.map((option) => option.trim());
  payload.options = options;

  if (form.questionType === "multiple_choice") {
    payload.correct_answer = form.multiAnswerIndexes.map((index) => Number(index));
    return payload;
  }

  payload.correct_answer = Number(form.singleAnswerIndex);
  return payload;
};

const ContestExamQuestionsScreen: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<ExamQuestion | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<QuestionFormState>(createInitialForm());
  const [notification, setNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const { confirm, modalProps } = useConfirmModal();

  const loadQuestions = useCallback(async () => {
    if (!contestId) return;
    try {
      setLoading(true);
      const list = await getExamQuestions(contestId);
      setQuestions(list.sort((a, b) => a.order - b.order));
    } catch (error) {
      console.error("Failed to load exam questions", error);
      setNotification({ kind: "error", message: "載入 Exam 題目失敗" });
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const questionSummary = useMemo(() => {
    const totalScore = questions.reduce((sum, question) => sum + question.score, 0);
    return { count: questions.length, totalScore };
  }, [questions]);

  const openCreateModal = () => {
    setEditingQuestion(null);
    setForm(createInitialForm());
    setModalOpen(true);
  };

  const openEditModal = (question: ExamQuestion) => {
    setEditingQuestion(question);
    setForm(toFormState(question));
    setModalOpen(true);
  };

  const validateForm = (): boolean => {
    if (!form.prompt.trim()) {
      setNotification({ kind: "error", message: "題目內容不可為空" });
      return false;
    }

    const score = Number(form.score || 0);
    if (!Number.isFinite(score) || score <= 0) {
      setNotification({ kind: "error", message: "配分必須大於 0" });
      return false;
    }

    if (!isObjectiveType(form.questionType)) {
      return true;
    }

    if (form.options.length < 2) {
      setNotification({ kind: "error", message: "客觀題至少需要 2 個選項" });
      return false;
    }

    if (form.options.some((option) => !option.trim())) {
      setNotification({ kind: "error", message: "選項文字不可空白" });
      return false;
    }

    if (form.questionType === "true_false" && form.options.length !== 2) {
      setNotification({ kind: "error", message: "是非題必須剛好 2 個選項" });
      return false;
    }

    if (
      (form.questionType === "single_choice" || form.questionType === "true_false") &&
      form.singleAnswerIndex === ""
    ) {
      setNotification({ kind: "error", message: "請選擇標準答案" });
      return false;
    }

    if (form.questionType === "multiple_choice" && form.multiAnswerIndexes.length === 0) {
      setNotification({ kind: "error", message: "多選題至少要選 1 個答案" });
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!contestId) return;
    if (!validateForm()) return;

    try {
      setSaving(true);
      const payload = buildPayload(form);

      if (editingQuestion) {
        await updateExamQuestion(contestId, editingQuestion.id, payload);
        setNotification({ kind: "success", message: "Exam 題目已更新" });
      } else {
        await createExamQuestion(contestId, {
          ...payload,
          order: questions.length,
        });
        setNotification({ kind: "success", message: "Exam 題目已新增" });
      }

      setModalOpen(false);
      await loadQuestions();
    } catch (error) {
      console.error("Failed to save exam question", error);
      const message = error instanceof Error ? error.message : "儲存失敗";
      setNotification({ kind: "error", message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (question: ExamQuestion) => {
    if (!contestId) return;

    const accepted = await confirm({
      title: `確定刪除題目 #${question.order + 1}？`,
      danger: true,
      confirmLabel: "刪除",
      cancelLabel: "取消",
    });

    if (!accepted) return;

    try {
      await deleteExamQuestion(contestId, question.id);
      setNotification({ kind: "success", message: "Exam 題目已刪除" });
      await loadQuestions();
    } catch (error) {
      console.error("Failed to delete exam question", error);
      setNotification({ kind: "error", message: "刪除失敗" });
    }
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    if (!contestId) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const reordered = [...questions];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const orders = reordered.map((question, order) => ({
      id: question.id,
      order,
    }));

    try {
      const updated = await reorderExamQuestions(contestId, orders);
      setQuestions(updated.sort((a, b) => a.order - b.order));
    } catch (error) {
      console.error("Failed to reorder exam questions", error);
      setNotification({ kind: "error", message: "排序更新失敗" });
    }
  };

  const handleTypeChange = (nextType: ExamQuestionType) => {
    setForm((prev) => {
      if (nextType === "essay") {
        return {
          ...prev,
          questionType: nextType,
          singleAnswerIndex: "",
          multiAnswerIndexes: [],
        };
      }

      if (nextType === "true_false") {
        const nextOptions = [...prev.options];
        if (nextOptions.length < 2) {
          nextOptions.push(...getDefaultOptions("true_false").slice(nextOptions.length));
        }
        return {
          ...prev,
          questionType: nextType,
          options: nextOptions.slice(0, 2),
          multiAnswerIndexes: [],
          singleAnswerIndex: "",
        };
      }

      return {
        ...prev,
        questionType: nextType,
        options: prev.options.length > 0 ? prev.options : getDefaultOptions(nextType),
        singleAnswerIndex: "",
        multiAnswerIndexes: [],
      };
    });
  };

  const addOption = () => {
    setForm((prev) => ({
      ...prev,
      options: [...prev.options, ""],
    }));
  };

  const updateOption = (index: number, value: string) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((option, idx) => (idx === index ? value : option)),
    }));
  };

  const removeOption = (index: number) => {
    setForm((prev) => {
      if (prev.questionType === "true_false" && prev.options.length <= 2) {
        return prev;
      }

      const nextOptions = prev.options.filter((_, idx) => idx !== index);
      const nextSingleAnswer =
        prev.singleAnswerIndex === String(index)
          ? ""
          : prev.singleAnswerIndex !== "" && Number(prev.singleAnswerIndex) > index
            ? String(Number(prev.singleAnswerIndex) - 1)
            : prev.singleAnswerIndex;

      const nextMultiAnswers = prev.multiAnswerIndexes
        .filter((item) => item !== String(index))
        .map((item) => {
          const numeric = Number(item);
          return numeric > index ? String(numeric - 1) : item;
        });

      return {
        ...prev,
        options: nextOptions,
        singleAnswerIndex: nextSingleAnswer,
        multiAnswerIndexes: nextMultiAnswers,
      };
    });
  };

  const answerOptions = form.options.map((option, index) => ({
    id: String(index),
    label: `${index + 1}. ${option.trim() || `選項 ${index + 1}`}`,
  }));

  return (
    <SurfaceSection maxWidth="1056px" style={{ flex: 1, minHeight: "100%" }}>
      <div style={{ width: "100%" }}>
        {notification ? (
          <InlineNotification
            kind={notification.kind}
            title={notification.kind === "success" ? "成功" : "錯誤"}
            subtitle={notification.message}
            onClose={() => setNotification(null)}
            style={{ marginBottom: "1rem" }}
          />
        ) : null}

        <ContainerCard
          title="Exam 題目管理"
          subtitle="可在競賽後台直接編輯考卷題目；Coding 題目流程維持既有模式。"
          action={
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                size="sm"
                kind="ghost"
                renderIcon={Renew}
                hasIconOnly
                iconDescription="重新整理"
                onClick={loadQuestions}
                disabled={loading}
              />
              <Button size="sm" renderIcon={Add} onClick={openCreateModal}>
                新增 Exam 題目
              </Button>
            </div>
          }
        >
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag type="teal">{`題目數：${questionSummary.count}`}</Tag>
            <Tag type="blue">{`總配分：${questionSummary.totalScore}`}</Tag>
          </div>
        </ContainerCard>

        <div style={{ marginTop: "1rem" }}>
          <ContainerCard title="題目清單" noPadding>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>順序</TableHeader>
                    <TableHeader>題型</TableHeader>
                    <TableHeader>題目內容</TableHeader>
                    <TableHeader>配分</TableHeader>
                    <TableHeader>操作</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {questions.map((question, index) => (
                    <TableRow key={question.id}>
                      <TableCell>{question.order + 1}</TableCell>
                      <TableCell>
                        <Tag type="outline">{TYPE_LABEL[question.questionType]}</Tag>
                      </TableCell>
                      <TableCell>
                        <div
                          style={{
                            maxWidth: "520px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={question.prompt}
                        >
                          {question.prompt}
                        </div>
                      </TableCell>
                      <TableCell>{question.score}</TableCell>
                      <TableCell>
                        <div style={{ display: "flex", gap: "0.25rem" }}>
                          <Button
                            kind="ghost"
                            size="sm"
                            hasIconOnly
                            iconDescription="上移"
                            renderIcon={ArrowUp}
                            disabled={index === 0}
                            onClick={() => handleMove(index, "up")}
                          />
                          <Button
                            kind="ghost"
                            size="sm"
                            hasIconOnly
                            iconDescription="下移"
                            renderIcon={ArrowDown}
                            disabled={index === questions.length - 1}
                            onClick={() => handleMove(index, "down")}
                          />
                          <Button
                            kind="ghost"
                            size="sm"
                            hasIconOnly
                            iconDescription="編輯"
                            renderIcon={Edit}
                            onClick={() => openEditModal(question)}
                          />
                          <Button
                            kind="danger--ghost"
                            size="sm"
                            hasIconOnly
                            iconDescription="刪除"
                            renderIcon={TrashCan}
                            onClick={() => handleDelete(question)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}

                  {questions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        {loading ? "載入中..." : "尚未建立 Exam 題目"}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>
          </ContainerCard>
        </div>

        <Modal
          open={modalOpen}
          modalHeading={editingQuestion ? "編輯 Exam 題目" : "新增 Exam 題目"}
          primaryButtonText={saving ? "儲存中..." : "儲存"}
          secondaryButtonText="取消"
          onRequestClose={() => setModalOpen(false)}
          onRequestSubmit={handleSave}
          primaryButtonDisabled={saving}
          size="lg"
        >
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            <Select
              id="exam-question-type"
              labelText="題型"
              value={form.questionType}
              onChange={(e) => handleTypeChange(e.target.value as ExamQuestionType)}
            >
              <SelectItem value="single_choice" text="單選題" />
              <SelectItem value="multiple_choice" text="多選題" />
              <SelectItem value="true_false" text="是非題" />
              <SelectItem value="essay" text="問答題" />
            </Select>

            <TextInput
              id="exam-question-score"
              labelText="配分"
              type="number"
              min={1}
              value={form.score}
              onChange={(e) => setForm((prev) => ({ ...prev, score: e.target.value }))}
            />

            <div style={{ gridColumn: "1 / -1" }}>
              <TextArea
                id="exam-question-prompt"
                labelText="題目內容"
                rows={5}
                value={form.prompt}
                onChange={(e) => setForm((prev) => ({ ...prev, prompt: e.target.value }))}
              />
            </div>

            {isObjectiveType(form.questionType) ? (
              <>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                      選項
                    </span>
                    <Button
                      size="sm"
                      kind="tertiary"
                      renderIcon={Add}
                      onClick={addOption}
                    >
                      新增選項
                    </Button>
                  </div>

                  <div style={{ display: "grid", gap: "0.5rem" }}>
                    {form.options.map((option, index) => (
                      <div
                        key={`option-${index}`}
                        style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5rem" }}
                      >
                        <TextInput
                          id={`exam-question-option-${index}`}
                          labelText={index === 0 ? "選項內容" : ""}
                          hideLabel={index !== 0}
                          placeholder={`選項 ${index + 1}`}
                          value={option}
                          onChange={(e) => updateOption(index, e.target.value)}
                        />
                        <Button
                          kind="danger--ghost"
                          size="sm"
                          hasIconOnly
                          iconDescription="刪除選項"
                          renderIcon={TrashCan}
                          onClick={() => removeOption(index)}
                          disabled={form.questionType === "true_false" && form.options.length <= 2}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {form.questionType === "multiple_choice" ? (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <MultiSelect
                      id="exam-question-multi-answer"
                      titleText="標準答案"
                      label="請選擇正確答案"
                      items={answerOptions}
                      itemToString={(item) => item?.label || ""}
                      selectedItems={answerOptions.filter((item) =>
                        form.multiAnswerIndexes.includes(item.id)
                      )}
                      onChange={({ selectedItems }: { selectedItems?: Array<{ id: string }> }) => {
                        setForm((prev) => ({
                          ...prev,
                          multiAnswerIndexes: selectedItems?.map((item) => item.id) || [],
                        }));
                      }}
                    />
                  </div>
                ) : (
                  <Select
                    id="exam-question-single-answer"
                    labelText="標準答案"
                    value={form.singleAnswerIndex}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, singleAnswerIndex: e.target.value }))
                    }
                  >
                    <SelectItem value="" text="請選擇答案" />
                    {answerOptions.map((option) => (
                      <SelectItem
                        key={`answer-${option.id}`}
                        value={option.id}
                        text={option.label}
                      />
                    ))}
                  </Select>
                )}
              </>
            ) : (
              <div style={{ gridColumn: "1 / -1" }}>
                <TextArea
                  id="exam-question-answer-essay"
                  labelText="參考答案（可選）"
                  rows={4}
                  value={form.essayReferenceAnswer}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      essayReferenceAnswer: e.target.value,
                    }))
                  }
                />
              </div>
            )}
          </div>
        </Modal>

        <ConfirmModal {...modalProps} />
      </div>
    </SurfaceSection>
  );
};

export default ContestExamQuestionsScreen;
