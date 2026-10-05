import { useCallback, type ReactNode } from "react";
import { InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { getExamPaper } from "@/infrastructure/api/repositories";
import { getExamPublishIssues } from "@/features/contest/domain/examPublishIssues";

/** Shared by the overview and settings publication actions. */
export function useExamPublishWarning(contestId?: string, contestType?: string) {
  const { t } = useTranslation("contest");
  /** Warn (without blocking) about unset answers and placeholder questions before publishing. */
  return useCallback(async (): Promise<ReactNode> => {
    if (!contestId || contestType !== "paper_exam") return undefined;
    let lines: string[];
    try {
      const { questions } = await getExamPaper(contestId);
      const issues = getExamPublishIssues(questions);
      lines = [
        ...(issues.missingAnswer.length
          ? [t("settings.publishCheck.missingAnswer", { questions: issues.missingAnswer.join(", ") })]
          : []),
        ...(issues.defaultContent.length
          ? [t("settings.publishCheck.defaultContent", { questions: issues.defaultContent.join(", ") })]
          : []),
      ];
    } catch (error) {
      console.error("Failed to load exam questions for publish check", error);
      lines = [t("settings.publishCheck.loadFailed")];
    }
    if (!lines.length) return undefined;
    return (
      <InlineNotification
        kind="warning"
        lowContrast
        hideCloseButton
        title={t("settings.publishCheck.title")}
      >
        {lines.map((line) => <div key={line}>{line}</div>)}
      </InlineNotification>
    );
  }, [contestType, contestId, t]);
}
