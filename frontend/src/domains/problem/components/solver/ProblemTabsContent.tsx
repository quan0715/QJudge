import React from "react";
import { InlineNotification } from "@carbon/react";
import { useNavigate } from "react-router-dom";
import ProblemPreview from "../ProblemPreview";
import ProblemSubmissionHistory from "../ProblemSubmissionHistory";
import ContainerCard from "@/ui/components/layout/ContainerCard";
import ProblemStatsTabComponent from "./ProblemStatsTab";
import ProblemForm from "../ProblemForm";
import type { ProblemFormData } from "../ProblemForm";
import { updateProblem, deleteProblem } from "@/services/problem";
import { useProblem } from "@/domains/problem/hooks/useProblem";

// Description Tab - Uses context
export const ProblemDescriptionTab: React.FC = () => {
  const { problem } = useProblem();

  if (!problem) return null;

  return (
    <ContainerCard
      title="題目"
      style={{ padding: "0", width: "100%", margin: "0 auto" }}
    >
      <ProblemPreview
        title={problem.title}
        difficulty={problem.difficulty}
        timeLimit={problem.timeLimit}
        memoryLimit={problem.memoryLimit}
        translations={problem.translations}
        testCases={problem.testCases?.filter((tc: any) => tc.isSample)}
        tags={problem.tags}
        showLanguageToggle={(problem.translations?.length ?? 0) > 1}
        compact={false}
        forbiddenKeywords={problem.forbiddenKeywords}
        requiredKeywords={problem.requiredKeywords}
      />
    </ContainerCard>
  );
};

// History Tab - Uses context
export const ProblemHistoryTab: React.FC = () => (
  <ContainerCard style={{ width: "100%", margin: "0 auto" }} noPadding>
    <ProblemSubmissionHistory />
  </ContainerCard>
);

// Stats Tab - Uses context
export const ProblemStatsTab: React.FC = () => <ProblemStatsTabComponent />;

// Settings Tab - Uses context
interface Notification {
  kind: "success" | "error" | "info" | "warning";
  title: string;
  subtitle?: string;
}

export const ProblemSettingsTab: React.FC = () => {
  const navigate = useNavigate();
  const { problem, refetchProblem } = useProblem();
  const [loading, setLoading] = React.useState(false);
  const [notification, setNotification] = React.useState<Notification | null>(
    null
  );

  // Transform ProblemDetail to ProblemFormData (CamelCase for Form)
  const initialData: Partial<ProblemFormData> = React.useMemo(() => {
    if (!problem) return {};

    return {
      title: problem.title,
      difficulty: problem.difficulty,
      timeLimit: problem.timeLimit,
      memoryLimit: problem.memoryLimit,
      isVisible: problem.isVisible,
      translations: problem.translations || [],
      testCases:
        problem.testCases?.map((tc: any) => ({
          input: tc.input || tc.inputData || "",
          output: tc.output || tc.outputData || "",
          isSample: tc.isSample ?? false,
          score: tc.score ?? 10,
          order: tc.order ?? 0,
          isHidden: tc.isHidden ?? false,
        })) || [],
      languageConfigs:
        problem.languageConfigs?.map((lc: any) => ({
          language: lc.language,
          templateCode: lc.templateCode,
          isEnabled: lc.isEnabled,
          order: lc.order || 0,
        })) || [],
      existingTagIds: problem.tags?.map((t) => Number(t.id)) || [],
      newTagNames: [],
      forbiddenKeywords: problem.forbiddenKeywords || [],
      requiredKeywords: problem.requiredKeywords || [],
    };
  }, [problem]);

  if (!problem) return null;

  const handleSubmit = async (data: ProblemFormData) => {
    setLoading(true);
    setNotification(null);

    try {
      const payload = {
        title: data.title,
        difficulty: data.difficulty,
        time_limit: data.timeLimit,
        memory_limit: data.memoryLimit,
        is_visible: data.isVisible,
        translations: data.translations.map((t) => ({
          language: t.language,
          title: t.title,
          description: t.description,
          input_description: t.inputDescription,
          output_description: t.outputDescription,
          hint: t.hint,
        })),
        test_cases: data.testCases.map((tc) => ({
          input_data: tc.input,
          output_data: tc.output,
          is_sample: tc.isSample,
          score: tc.score,
          order: tc.order,
          is_hidden: tc.isHidden,
        })),
        language_configs: data.languageConfigs.map((lc) => ({
          language: lc.language,
          template_code: lc.templateCode,
          is_enabled: lc.isEnabled,
          order: lc.order,
        })),
        existing_tag_ids: data.existingTagIds,
        new_tag_names: data.newTagNames,
        forbidden_keywords: data.forbiddenKeywords || [],
        required_keywords: data.requiredKeywords || [],
      };

      await updateProblem(problem.id, payload);

      setNotification({
        kind: "success",
        title: "更新成功",
        subtitle: "題目已成功更新",
      });

      // Refresh problem data in context
      refetchProblem();
    } catch (error: any) {
      console.error("Failed to update problem:", error);
      setNotification({
        kind: "error",
        title: "更新失敗",
        subtitle: error.message || "請稍後再試",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`確定要刪除題目「${problem.title}」嗎？此操作無法復原。`)) {
      return;
    }

    try {
      await deleteProblem(problem.id);
      setNotification({
        kind: "success",
        title: "刪除成功",
        subtitle: "正在跳轉...",
      });
      setTimeout(() => navigate("/management/problems"), 1000);
    } catch (error: any) {
      console.error("Failed to delete problem:", error);
      setNotification({
        kind: "error",
        title: "刪除失敗",
        subtitle: error.message || "請稍後再試",
      });
    }
  };

  return (
    <ContainerCard
      noPadding
      style={{ width: "100%", margin: "0 auto", minHeight: "600px" }}
    >
      {/* Notification */}
      {notification && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            padding: "0",
          }}
        >
          <InlineNotification
            kind={notification.kind}
            title={notification.title}
            subtitle={notification.subtitle}
            onClose={() => setNotification(null)}
            lowContrast
            style={{ maxWidth: "100%", marginBottom: 0 }}
          />
        </div>
      )}

      <div style={{ padding: "1rem" }}>
        <ProblemForm
          initialData={initialData}
          onSubmit={handleSubmit}
          onCancel={() => {}}
          onDelete={handleDelete}
          isEditMode={true}
          loading={loading}
        />
      </div>
    </ContainerCard>
  );
};
