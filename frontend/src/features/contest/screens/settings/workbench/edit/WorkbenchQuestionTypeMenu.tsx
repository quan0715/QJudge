import { MenuButton, MenuItem, MenuItemDivider } from "@carbon/react";
import { GroupObjects, DocumentImport } from "@carbon/icons-react";
import { EXAM_QUESTION_TYPE_ICON } from "@/shared/ui/examQuestionTypeVisual";
import { useTranslation } from "react-i18next";
import type { ExamQuestionType } from "@/core/entities/contest.entity";
import styles from "./WorkbenchEdit.module.scss";
export type AddMenuChoice =
  | { kind: "question"; type: ExamQuestionType }
  | { kind: "group" }
  | { kind: "bank" };
export function WorkbenchQuestionTypeMenu({
  onAdd,
  questionsOnly = false,
  label,
  value,
  allowedTypes,
  disabled = false,
}: {
  onAdd(choice: AddMenuChoice): void;
  questionsOnly?: boolean;
  label?: string;
  value?: ExamQuestionType;
  allowedTypes?: ExamQuestionType[];
  disabled?: boolean;
}) {
  const { t } = useTranslation("contest");
  const types: readonly ExamQuestionType[] = allowedTypes ?? [
    "single_choice",
    "multiple_choice",
    "true_false",
    "short_answer",
    "essay",
  ];
  const names = {
    single_choice: "單選題",
    multiple_choice: "多選題",
    true_false: "是非題",
    short_answer: "簡答題",
    essay: "問答題",
  };
  const items = types.map((type) => {
    const TypeIcon = EXAM_QUESTION_TYPE_ICON[type];
    return (
    <MenuItem
      key={type}
      renderIcon={() => <TypeIcon size={16} />}
      label={t(`common:questionType.label.${type}`, names[type])}
      onClick={() => onAdd({ kind: "question", type })}
    />
    );
  });
  if (!questionsOnly)
    items.push(
      <MenuItemDivider key="group-divider" />,
      <MenuItem
        renderIcon={GroupObjects}
        key="group"
        label={t("workbench.edit.addGroup", "題組")}
        onClick={() => onAdd({ kind: "group" })}
      />,
      <MenuItemDivider key="bank-divider" />,
      <MenuItem
        renderIcon={DocumentImport}
        key="bank"
        label={t("workbench.edit.importBank", "從題庫匯入…")}
        onClick={() => onAdd({ kind: "bank" })}
      />,
    );
  return (
    <MenuButton
      className={styles.addMenu}
      disabled={disabled}
      label={value ? t(`common:questionType.label.${value}`, names[value]) : label ?? t("workbench.edit.addQuestion", "新增題目")}
      kind="tertiary"
      size="md"
      menuAlignment="bottom-start"
    >
      {items}
    </MenuButton>
  );
}
