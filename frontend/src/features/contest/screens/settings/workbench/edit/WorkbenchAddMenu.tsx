import { MenuButton, MenuItem, MenuItemDivider } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ExamQuestionType } from "@/core/entities/contest.entity";
import styles from "./WorkbenchEdit.module.scss";
export type AddMenuChoice =
  | { kind: "question"; type: ExamQuestionType }
  | { kind: "group" }
  | { kind: "bank" };
export function WorkbenchAddMenu({
  onAdd,
  questionsOnly = false,
  label,
}: {
  onAdd(choice: AddMenuChoice): void;
  questionsOnly?: boolean;
  label?: string;
}) {
  const { t } = useTranslation("contest");
  const types: ExamQuestionType[] = [
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
  const items = types.map((type) => (
    <MenuItem
      key={type}
      label={t(`common:questionType.label.${type}`, names[type])}
      onClick={() => onAdd({ kind: "question", type })}
    />
  ));
  if (!questionsOnly)
    items.push(
      <MenuItemDivider key="group-divider" />,
      <MenuItem
        key="group"
        label={t("workbench.edit.addGroup", "題組")}
        onClick={() => onAdd({ kind: "group" })}
      />,
      <MenuItemDivider key="bank-divider" />,
      <MenuItem
        key="bank"
        label={t("workbench.edit.importBank", "從題庫匯入…")}
        onClick={() => onAdd({ kind: "bank" })}
      />,
    );
  return (
    <MenuButton
      className={questionsOnly ? undefined : styles.addMenu}
      label={label ?? t("workbench.edit.addQuestion", "新增題目")}
      kind={questionsOnly ? "ghost" : "tertiary"}
      size={questionsOnly ? "sm" : "md"}
      menuAlignment={questionsOnly ? "bottom-end" : "bottom-start"}
    >
      {items}
    </MenuButton>
  );
}
