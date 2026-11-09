import { useTranslation } from "react-i18next";
import { QuestionStepper } from "@/shared/layout/QuestionStepper";
import { useContestRuntimeNavigator } from "../../contexts/useContestRuntimeNavigator";

/** Previous / next for coding problems, driven by the registered runtime navigator. */
export function CodingQuestionStepper() {
  const { t } = useTranslation("contest");
  const navigator = useContestRuntimeNavigator();
  if (!navigator || navigator.items.length < 2) return null;
  return (
    <QuestionStepper
      index={navigator.activeIndex}
      total={navigator.items.length}
      onChange={navigator.onSelect}
      previousLabel={t("answering.navigation.prevQuestion", "上一題")}
      nextLabel={t("answering.navigation.nextQuestion", "下一題")}
    />
  );
}
