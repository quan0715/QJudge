import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loading,
  Button,
  Header,
  HeaderName,
  InlineNotification,
  Modal,
  ContentSwitcher,
  Switch,
  Dropdown,
} from "@carbon/react";
import { ArrowLeft, Upload, View, Download } from "@carbon/icons-react";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import { getProblem, patchProblem, deleteProblem } from "@/infrastructure/api/repositories/problem.repository";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { ScrollSpyLayout, type NavSection, type SectionValidationState } from "./section/layout";
import { GlobalSaveStatus } from "@/features/problems/components/edit/common";
import { ProblemEditProvider, useProblemEdit } from "@/features/problems/contexts/ProblemEditContext";
import BasicInfoSection from "@/features/problems/components/edit/problemForm/sections/BasicInfoSection";
import ContentSection from "@/features/problems/components/edit/problemForm/sections/ContentSection";
import TestCasesSection from "@/features/problems/components/edit/problemForm/sections/TestCasesSection";
import LanguageConfigSection from "@/features/problems/components/edit/problemForm/sections/LanguageConfigSection";
import DangerZoneSection from "@/features/problems/components/edit/problemForm/sections/DangerZoneSection";
import { ProblemPreview } from "@/shared/ui/problem";
import { ProblemImportModal } from "@/features/problems/components/modals";
import {
  MarkdownEditorProvider,
  GlobalMarkdownEditorModal,
} from "@/shared/ui/markdown/markdownEditor";
import {
  DEFAULT_PROBLEM_FORM_VALUES,
  type ProblemFormSchema,
} from "@/features/problems/forms/problemFormSchema";
import { problemFormSchema } from "@/features/problems/forms/problemFormValidation";
import { problemDetailToFormSchema } from "@/features/problems/forms/problemFormAdapters";
import type { ProblemYAML } from "@/shared/utils/problemYamlParser";
import { yamlToFormSchema } from "@/features/problems/forms/problemFormAdapters";
import "./screen.scss";

/**
 * Base section configurations for scroll-spy navigation
 */
const BASE_SECTIONS = [
  { id: "basic-info", label: "基本資訊" },
  { id: "content", label: "題目內容" },
  { id: "test-cases", label: "測試案例" },
  { id: "language-config", label: "語言設定" },
  { id: "danger-zone", label: "Danger Zone" },
] as const;

/**
 * Get validation state for a section based on form errors
 */
function getSectionValidationState(
  sectionId: string,
  errors: Record<string, unknown>,
  touchedFields: Record<string, unknown>
): { state: SectionValidationState; errorCount: number } {
  const sectionFieldMap: Record<string, string[]> = {
    "basic-info": ["title", "difficulty", "timeLimit", "memoryLimit"],
    "content": ["translationZh", "translationEn"],
    "test-cases": ["testCases"],
    "language-config": ["languageConfigs", "forbiddenKeywords", "requiredKeywords"],
    "danger-zone": ["isVisible"],
  };

  const fields = sectionFieldMap[sectionId] || [];
  let errorCount = 0;
  let hasTouched = false;

  for (const field of fields) {
    if (errors[field]) {
      errorCount++;
    }
    if (touchedFields[field]) {
      hasTouched = true;
    }
  }

  if (errorCount > 0) {
    return { state: "invalid", errorCount };
  }
  if (hasTouched) {
    return { state: "valid", errorCount: 0 };
  }
  return { state: "none", errorCount: 0 };
}

/**
 * Convert form schema to preview format
 */
const formSchemaToPreview = (
  formData: Partial<ProblemFormSchema>
): ProblemDetail => {
  const zhTranslation = formData.translationZh;
  return {
    id: "preview",
    title: formData.title || zhTranslation?.title || "未命名題目",
    difficulty: formData.difficulty || "medium",
    description: zhTranslation?.description || "",
    inputDescription: zhTranslation?.inputDescription || "",
    outputDescription: zhTranslation?.outputDescription || "",
    hint: zhTranslation?.hint || "",
    timeLimit: formData.timeLimit || 1000,
    memoryLimit: formData.memoryLimit || 128,
    createdAt: new Date().toISOString(),
    testCases: formData.testCases || [],
    languageConfigs: formData.languageConfigs || [],
    translations: zhTranslation
      ? [{ language: "zh-TW", ...zhTranslation, title: zhTranslation.title || "" }]
      : [],
    tags: [],
    acceptanceRate: 0,
    submissionCount: 0,
    acceptedCount: 0,
    waCount: 0,
    tleCount: 0,
    mleCount: 0,
    reCount: 0,
    ceCount: 0,
    isPracticeVisible: false,
    isVisible: formData.isVisible ?? true,
    isSolved: false,
  };
};

/**
 * ProblemEditPage - Full-screen problem editor with auto-save
 *
 * Features:
 * - Scroll-spy navigation
 * - Field-level auto-save (PATCH)
 * - Preview modal
 * - Danger Zone for delete/visibility
 */
const ProblemEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    kind: "success" | "error";
    title: string;
    subtitle?: string;
  } | null>(null);

  // Modals
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Export settings
  const [exportFormat, setExportFormat] = useState<"pdf" | "yaml">("pdf");
  const [pdfScale, setPdfScale] = useState<number>(100);

  // Permission check
  const canEdit = user && (user.role === "admin" || user.role === "teacher");

  // Form setup with Zod validation
  const methods = useForm<ProblemFormSchema>({
    defaultValues: DEFAULT_PROBLEM_FORM_VALUES,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(problemFormSchema) as any,
    mode: "onBlur", // Validate on blur for better UX
  });

  const { reset, watch, formState: { errors, touchedFields } } = methods;

  // Compute sections with validation state
  const sectionsWithValidation: NavSection[] = useMemo(() => {
    return BASE_SECTIONS.map((section) => {
      const { state, errorCount } = getSectionValidationState(
        section.id,
        errors as Record<string, unknown>,
        touchedFields as Record<string, unknown>
      );
      return {
        ...section,
        validationState: state,
        errorCount,
      };
    });
  }, [errors, touchedFields]);

  // Load problem data
  useEffect(() => {
    const fetchProblem = async () => {
      if (!id) return;
      try {
        const fetchedProblem = await getProblem(id);
        if (!fetchedProblem) throw new Error("Problem not found");
        setProblem(fetchedProblem);
        reset(problemDetailToFormSchema(fetchedProblem));
      } catch (err) {
        setError("無法載入題目資料");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchProblem();
  }, [id, reset]);

  // Handle YAML import
  const handleYAMLImport = useCallback(
    (yamlData: ProblemYAML) => {
      const formData = yamlToFormSchema(yamlData);
      reset(formData, { keepDefaultValues: false });
      setNotification({
        kind: "success",
        title: "匯入成功",
        subtitle: "YAML 資料已匯入，請檢查後儲存",
      });
    },
    [reset]
  );

  // Handle visibility change
  const handleVisibilityChange = async (isVisible: boolean) => {
    if (!problem) return;
    try {
      await patchProblem(problem.id, { is_visible: isVisible });
      setProblem({ ...problem, isVisible });
      methods.setValue("isVisible", isVisible);
      setNotification({
        kind: "success",
        title: isVisible ? "題目已公開" : "題目已隱藏",
      });
    } catch (err) {
      setNotification({
        kind: "error",
        title: "操作失敗",
        subtitle: err instanceof Error ? err.message : "請稍後再試",
      });
      throw err;
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!problem) return;
    try {
      await deleteProblem(problem.id);
      setNotification({
        kind: "success",
        title: "刪除成功",
        subtitle: "正在跳轉...",
      });
      setTimeout(() => navigate("/problems"), 1000);
    } catch (err) {
      setNotification({
        kind: "error",
        title: "刪除失敗",
        subtitle: err instanceof Error ? err.message : "請稍後再試",
      });
      throw err;
    }
  };

  // Watch form values for preview
  const watchedValues = watch();
  const previewData = formSchemaToPreview(watchedValues);

  // Handle export
  const handleExportConfirm = useCallback(() => {
    if (!problem) return;

    if (exportFormat === "yaml") {
      // YAML export
      // TODO: Implement proper YAML export with form data
      const yamlContent = `# Problem: ${problem.title}\n# Export not yet implemented`;
      const blob = new Blob([yamlContent], { type: "text/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${problem.title.replace(/[^a-zA-Z0-9]/g, "_")}.yaml`;
      a.click();
      URL.revokeObjectURL(url);
      
      setExportModalOpen(false);
      setNotification({
        kind: "success",
        title: "YAML 匯出成功",
        subtitle: "檔案已下載",
      });
    } else {
      // PDF export
      // TODO: Implement PDF export with scale option
      setExportModalOpen(false);
      setNotification({
        kind: "success",
        title: "PDF 匯出",
        subtitle: `PDF 匯出功能開發中... (縮放比例: ${pdfScale}%)`,
      });
    }
  }, [problem, exportFormat, pdfScale]);

  // Render header (without GlobalSaveStatus - will be added by inner component)
  const renderHeader = (globalSaveStatus?: React.ReactNode) => (
    <Header aria-label="Problem Editor" className="problem-edit-page__header">
      <Button
        kind="ghost"
        hasIconOnly
        renderIcon={ArrowLeft}
        iconDescription="返回"
        onClick={() => navigate(-1)}
        className="problem-edit-page__back-btn"
      />
      <HeaderName prefix="" className="problem-edit-page__title">
        {problem?.title || "載入中..."}
      </HeaderName>
      <div className="problem-edit-page__header-actions">
        {globalSaveStatus}
        <Button
          kind="ghost"
          renderIcon={Upload}
          onClick={() => setImportModalOpen(true)}
        >
          匯入
        </Button>
        <Button
          kind="ghost"
          renderIcon={Download}
          onClick={() => setExportModalOpen(true)}
        >
          匯出
        </Button>
        <Button
          kind="secondary"
          renderIcon={View}
          onClick={() => setPreviewOpen(true)}
        >
          預覽
        </Button>
      </div>
    </Header>
  );

  // Permission denied
  if (!canEdit) {
    return (
      <div className="problem-edit-page">
        {renderHeader()}
        <div className="problem-edit-page__error">
          <h3>權限不足</h3>
          <p>您沒有編輯題目的權限</p>
          <Button kind="secondary" onClick={() => navigate(-1)}>
            返回
          </Button>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="problem-edit-page">
        {renderHeader()}
        <div className="problem-edit-page__loading">
          <Loading />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !problem) {
    return (
      <div className="problem-edit-page">
        {renderHeader()}
        <div className="problem-edit-page__error">
          <h3>{error || "題目不存在"}</h3>
          <Button kind="secondary" onClick={() => navigate(-1)}>
            返回
          </Button>
        </div>
      </div>
    );
  }

  return (
    <MarkdownEditorProvider>
      <FormProvider {...methods}>
        <ProblemEditProvider problemId={id || ""}>
          <ProblemEditPageContent
            problem={problem}
            notification={notification}
            setNotification={setNotification}
            sectionsWithValidation={sectionsWithValidation}
            watchedValues={watchedValues}
            previewData={previewData}
            previewOpen={previewOpen}
            setPreviewOpen={setPreviewOpen}
            importModalOpen={importModalOpen}
            setImportModalOpen={setImportModalOpen}
            exportModalOpen={exportModalOpen}
            setExportModalOpen={setExportModalOpen}
            exportFormat={exportFormat}
            setExportFormat={setExportFormat}
            pdfScale={pdfScale}
            setPdfScale={setPdfScale}
            handleYAMLImport={handleYAMLImport}
            handleVisibilityChange={handleVisibilityChange}
            handleDelete={handleDelete}
            handleExportConfirm={handleExportConfirm}
            renderHeader={renderHeader}
          />
        </ProblemEditProvider>
      </FormProvider>
    </MarkdownEditorProvider>
  );
};

/**
 * Inner component that can access ProblemEditContext
 */
interface ProblemEditPageContentProps {
  problem: ProblemDetail;
  notification: { kind: "success" | "error"; title: string; subtitle?: string } | null;
  setNotification: React.Dispatch<React.SetStateAction<{ kind: "success" | "error"; title: string; subtitle?: string } | null>>;
  sectionsWithValidation: NavSection[];
  watchedValues: ProblemFormSchema;
  previewData: ProblemDetail;
  previewOpen: boolean;
  setPreviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
  importModalOpen: boolean;
  setImportModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  exportModalOpen: boolean;
  setExportModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  exportFormat: "pdf" | "yaml";
  setExportFormat: React.Dispatch<React.SetStateAction<"pdf" | "yaml">>;
  pdfScale: number;
  setPdfScale: React.Dispatch<React.SetStateAction<number>>;
  handleYAMLImport: (yamlData: ProblemYAML) => void;
  handleVisibilityChange: (isVisible: boolean) => Promise<void>;
  handleDelete: () => Promise<void>;
  handleExportConfirm: () => void;
  renderHeader: (globalSaveStatus?: React.ReactNode) => React.ReactNode;
}

const ProblemEditPageContent: React.FC<ProblemEditPageContentProps> = ({
  problem,
  notification,
  setNotification,
  sectionsWithValidation,
  watchedValues,
  previewData,
  previewOpen,
  setPreviewOpen,
  importModalOpen,
  setImportModalOpen,
  exportModalOpen,
  setExportModalOpen,
  exportFormat,
  setExportFormat,
  pdfScale,
  setPdfScale,
  handleYAMLImport,
  handleVisibilityChange,
  handleDelete,
  handleExportConfirm,
  renderHeader,
}) => {
  // Access auto-save context
  const { autoSave } = useProblemEdit();

  // PDF scale options
  const PDF_SCALE_OPTIONS = [
    { id: "50", text: "50%" },
    { id: "75", text: "75%" },
    { id: "100", text: "100%" },
    { id: "125", text: "125%" },
    { id: "150", text: "150%" },
  ];

  return (
    <div className="problem-edit-page">
      {renderHeader(<GlobalSaveStatus status={autoSave.globalStatus} />)}

      {/* Notification */}
      {notification && (
        <div className="problem-edit-page__notification">
          <InlineNotification
            kind={notification.kind}
            title={notification.title}
            subtitle={notification.subtitle}
            onClose={() => setNotification(null)}
            lowContrast
          />
        </div>
      )}

      {/* Main Content */}
      <div className="problem-edit-page__content">
        <ScrollSpyLayout
          sections={sectionsWithValidation}
          onPreviewClick={() => setPreviewOpen(true)}
        >
          {({ registerSection }) => (
            <div className="problem-edit-page__sections">
              {/* Basic Info */}
              <section
                id="basic-info"
                ref={registerSection("basic-info")}
                className="problem-edit-page__section"
              >
                <h2 className="problem-edit-page__section-title">基本資訊</h2>
                <BasicInfoSection />
              </section>

              {/* Content */}
              <section
                id="content"
                ref={registerSection("content")}
                className="problem-edit-page__section"
              >
                <h2 className="problem-edit-page__section-title">題目內容</h2>
                <ContentSection />
              </section>

              {/* Test Cases */}
              <section
                id="test-cases"
                ref={registerSection("test-cases")}
                className="problem-edit-page__section"
              >
                <h2 className="problem-edit-page__section-title">測試案例</h2>
                <TestCasesSection />
              </section>

              {/* Language Config */}
              <section
                id="language-config"
                ref={registerSection("language-config")}
                className="problem-edit-page__section"
              >
                <h2 className="problem-edit-page__section-title">語言設定</h2>
                <LanguageConfigSection />
              </section>

              {/* Danger Zone */}
              <section
                id="danger-zone"
                ref={registerSection("danger-zone")}
                className="problem-edit-page__section problem-edit-page__section--danger"
              >
                <DangerZoneSection
                  problemTitle={problem.title}
                  isVisible={watchedValues.isVisible ?? true}
                  onVisibilityChange={handleVisibilityChange}
                  onDelete={handleDelete}
                />
              </section>
            </div>
          )}
        </ScrollSpyLayout>
      </div>

      {/* Preview Modal */}
      <Modal
        open={previewOpen}
        onRequestClose={() => setPreviewOpen(false)}
        modalHeading="題目預覽"
        passiveModal
        size="lg"
        className="problem-edit-page__preview-modal"
      >
        <ProblemPreview problem={previewData} compact />
      </Modal>

      {/* YAML Import Modal */}
      <ProblemImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onPopulate={handleYAMLImport}
        mode="populateForm"
      />

      {/* Export Modal */}
      <Modal
        open={exportModalOpen}
        onRequestClose={() => setExportModalOpen(false)}
        onRequestSubmit={handleExportConfirm}
        modalHeading="匯出題目"
        primaryButtonText="匯出"
        secondaryButtonText="取消"
        size="sm"
        className="problem-edit-page__export-modal"
      >
        <div className="problem-edit-page__export-content">
          <ContentSwitcher
            onChange={(e) => setExportFormat(e.name as "pdf" | "yaml")}
            selectedIndex={exportFormat === "pdf" ? 0 : 1}
            size="md"
            className="problem-edit-page__export-switcher"
          >
            <Switch name="pdf" text="PDF" />
            <Switch name="yaml" text="YAML" />
          </ContentSwitcher>

          {exportFormat === "pdf" && (
            <div className="problem-edit-page__export-options">
              <Dropdown
                id="pdf-scale"
                titleText="縮放比例"
                label="選擇縮放比例"
                items={PDF_SCALE_OPTIONS}
                itemToString={(item) => (item ? item.text : "")}
                selectedItem={PDF_SCALE_OPTIONS.find(
                  (opt) => opt.id === String(pdfScale)
                )}
                onChange={({ selectedItem }) => {
                  if (selectedItem) {
                    setPdfScale(Number(selectedItem.id));
                  }
                }}
              />
            </div>
          )}

          {exportFormat === "yaml" && (
            <p className="problem-edit-page__export-description">
              將題目資料匯出為 YAML 格式，可用於備份或匯入至其他系統。
            </p>
          )}
        </div>
      </Modal>

      <GlobalMarkdownEditorModal />
    </div>
  );
};

export default ProblemEditPage;
