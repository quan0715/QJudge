/**
 * UserInputModal - Modal for AI agent questions
 *
 * Displays questions from the AI agent (via AskUserQuestion tool)
 * and allows users to select options.
 */

import {
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  RadioButtonGroup,
  RadioButton,
  Checkbox,
  Tag,
} from "@carbon/react";
import { useState } from "react";
import type { UserInputQuestion } from "@/core/types/chatbot.types";
import styles from "./UserInputModal.module.scss";

interface UserInputModalProps {
  isOpen: boolean;
  requestId: string;
  questions: UserInputQuestion[];
  onSubmit: (requestId: string, answers: Record<string, string>) => void;
  onCancel: () => void;
}

export function UserInputModal({
  isOpen,
  requestId,
  questions,
  onSubmit,
  onCancel,
}: UserInputModalProps) {
  // Track answers for each question
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const handleSingleSelect = (questionText: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionText]: value,
    }));
  };

  const handleMultiSelect = (
    questionText: string,
    value: string,
    checked: boolean
  ) => {
    setAnswers((prev) => {
      const current = (prev[questionText] as string[]) || [];
      if (checked) {
        return { ...prev, [questionText]: [...current, value] };
      } else {
        return {
          ...prev,
          [questionText]: current.filter((v) => v !== value),
        };
      }
    });
  };

  const handleSubmit = () => {
    // Convert answers to the expected format (string values)
    const formattedAnswers: Record<string, string> = {};
    for (const [question, answer] of Object.entries(answers)) {
      if (Array.isArray(answer)) {
        formattedAnswers[question] = answer.join(", ");
      } else {
        formattedAnswers[question] = answer;
      }
    }
    onSubmit(requestId, formattedAnswers);
  };

  // Check if all required questions have answers
  const isComplete = questions.every((q) => {
    const answer = answers[q.question];
    if (q.multiSelect) {
      return Array.isArray(answer) && answer.length > 0;
    }
    return !!answer;
  });

  return (
    <ComposedModal open={isOpen} onClose={onCancel} size="sm">
      <ModalHeader title="AI 助教需要您的回答" />
      <ModalBody>
        <div className={styles.questionsContainer}>
          {questions.map((question, qIndex) => (
            <div key={qIndex} className={styles.questionBlock}>
              <div className={styles.questionHeader}>
                <Tag type="blue" size="sm">
                  {question.header}
                </Tag>
                <span className={styles.questionText}>{question.question}</span>
              </div>

              <div className={styles.optionsContainer}>
                {question.multiSelect ? (
                  // Multi-select: use checkboxes
                  <div className={styles.checkboxGroup}>
                    {question.options.map((option, oIndex) => (
                      <Checkbox
                        key={oIndex}
                        id={`q${qIndex}-opt${oIndex}`}
                        labelText={
                          <span className={styles.optionLabel}>
                            <strong>{option.label}</strong>
                            {option.description && (
                              <span className={styles.optionDesc}>
                                {option.description}
                              </span>
                            )}
                          </span>
                        }
                        checked={
                          (
                            (answers[question.question] as string[]) || []
                          ).includes(option.label)
                        }
                        onChange={(
                          _: React.ChangeEvent<HTMLInputElement>,
                          { checked }: { checked: boolean }
                        ) =>
                          handleMultiSelect(
                            question.question,
                            option.label,
                            checked
                          )
                        }
                      />
                    ))}
                  </div>
                ) : (
                  // Single-select: use radio buttons
                  <RadioButtonGroup
                    name={`question-${qIndex}`}
                    orientation="vertical"
                    valueSelected={answers[question.question] as string}
                    onChange={(value: string) =>
                      handleSingleSelect(question.question, value)
                    }
                  >
                    {question.options.map((option, oIndex) => (
                      <RadioButton
                        key={oIndex}
                        id={`q${qIndex}-opt${oIndex}`}
                        value={option.label}
                        labelText={
                          <span className={styles.optionLabel}>
                            <strong>{option.label}</strong>
                            {option.description && (
                              <span className={styles.optionDesc}>
                                {option.description}
                              </span>
                            )}
                          </span>
                        }
                      />
                    ))}
                  </RadioButtonGroup>
                )}
              </div>
            </div>
          ))}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onCancel}>
          跳過
        </Button>
        <Button kind="primary" onClick={handleSubmit} disabled={!isComplete}>
          確認
        </Button>
      </ModalFooter>
    </ComposedModal>
  );
}
