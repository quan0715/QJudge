import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { InlineNotification, Modal, Button } from "@carbon/react";
import { Code, Edit } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import type {
  ProblemDetail as Problem,
  LanguageConfig,
} from "@/core/entities/problem.entity";
import type { SubmissionDetail } from "@/core/entities/submission.entity";
import {
  LANGUAGE_OPTIONS,
  DEFAULT_TEMPLATES,
} from "@/features/problems/constants/codeTemplates";
import { testRun } from "@/infrastructure/api/repositories/problem.repository";

// Layout Components
import ProblemHero from "@/features/problems/components/layout/ProblemHero";
import ContainerCard from "@/shared/layout/ContainerCard";

// Content Components
import { ProblemPreview } from "@/shared/ui/problem";
import {
  ProblemCodingTab,
  ProblemStatsTab,
  ProblemSubmissionList,
} from "@/features/problems/components/solve";
import { DiscussionList } from "@/features/problems/components/discussions";
import { type TestCaseItem } from "@/core/entities/testcase.entity";
import { SubmissionDetailModal } from "@/features/submissions/components";
import {
  ProblemProvider,
  useProblem,
} from "@/features/problems/hooks/useProblem";
import "./ProblemDetailSection.scss";

interface ProblemDetailSectionProps {
  problem: Problem;
  initialCode?: string;
  initialLanguage?: string;
  onSubmit: (
    code: string,
    language: string
  ) => Promise<SubmissionDetail | void>;
}

/**
 * Internal component that uses ProblemProvider context
 */
const ProblemDetailSectionInner: React.FC<Omit<ProblemDetailSectionProps, "problem">> = ({
  initialCode = "",
  initialLanguage = "",
  onSubmit,
}) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation("problem");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();

  // Get problem from context
  const { problem } = useProblem();

  // -- State: Code & Language --
  const [activeLanguage, setActiveLanguage] = useState<string>(
    initialLanguage || "python"
  );
  const [code, setCode] = useState<string>(initialCode);
  const [languageConfigs, setLanguageConfigs] = useState<LanguageConfig[]>([]);

  // -- State: Test Cases --
  const [testCases, setTestCases] = useState<TestCaseItem[]>([]);

  // -- State: Submission --
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -- State: Modals --
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [resultSubmissionId, setResultSubmissionId] = useState<string | null>(
    null
  );

  // -- Persistence Keys --
  const getCodeKey = (lang: string) =>
    `qjudge:problem:${problem?.id}:code:${lang}`;
  const getCustomCasesKey = () =>
    `qjudge:problem:${problem?.id}:custom_test_cases`;

  // -- Init Logic --
  useEffect(() => {
    if (!problem) return;

    // 1. Language Configs
    let configs = problem.languageConfigs || [];
    if (configs.length === 0) {
      configs = LANGUAGE_OPTIONS.map((opt) => ({
        language: opt.id,
        templateCode: DEFAULT_TEMPLATES[opt.id] || "",
        isEnabled: true,
      }));
    }
    setLanguageConfigs(configs);

    // 2. Select Language
    let targetLang = activeLanguage;
    if (!configs.find((c) => c.language === targetLang)) {
      targetLang = configs.find((c) => c.isEnabled)?.language || "python";
      setActiveLanguage(targetLang);
    }

    // 3. Load Code (Storage -> Template)
    if (typeof window !== "undefined") {
      const savedCode = localStorage.getItem(getCodeKey(targetLang));
      if (savedCode) {
        setCode(savedCode);
      } else {
        const tmpl = configs.find(
          (c) => c.language === targetLang
        )?.templateCode;
        setCode(tmpl || "");
      }
    }

    // 4. Load Test Cases (Public + Custom from Storage)
    const publicCases: TestCaseItem[] = (problem.testCases || [])
      .filter((tc) => tc.isSample)
      .map((tc, idx) => ({
        id: `public_${idx}`,
        input: tc.input,
        output: tc.output,
        isSample: true,
        source: "public",
        enabled: true,
      }));

    let customCases: TestCaseItem[] = [];
    if (typeof window !== "undefined") {
      try {
        const savedCustom = localStorage.getItem(getCustomCasesKey());
        if (savedCustom) {
          const parsed = JSON.parse(savedCustom);
          if (Array.isArray(parsed)) {
            customCases = parsed;
          }
        }
      } catch (e) {
        console.error("Failed to parse custom test cases", e);
      }
    }

    setTestCases([...publicCases, ...customCases]);
  }, [problem?.id]);

  // -- Code Change & Persistence --
  useEffect(() => {
    if (activeLanguage && code && typeof window !== "undefined" && problem) {
      localStorage.setItem(getCodeKey(activeLanguage), code);
    }
  }, [code, activeLanguage, problem?.id]);

  // -- Language Change Handler --
  const handleLanguageChange = (newLang: string) => {
    setActiveLanguage(newLang);
    const savedCode = localStorage.getItem(getCodeKey(newLang));
    if (savedCode) {
      setCode(savedCode);
    } else {
      const tmpl = languageConfigs.find(
        (c) => c.language === newLang
      )?.templateCode;
      setCode(tmpl || "");
    }
  };

  // -- Test Case Handlers --
  const handleAddTestCase = (input: string, output: string) => {
    const newCase: TestCaseItem = {
      id: `custom_${Date.now()}`,
      input,
      output,
      source: "custom",
    };
    setTestCases((prev) => {
      const next = [...prev, newCase];
      saveCustomCases(next);
      return next;
    });
  };

  const handleDeleteTestCase = (id: string) => {
    setTestCases((prev) => {
      const next = prev.filter((tc) => tc.id !== id);
      saveCustomCases(next);
      return next;
    });
  };

  const saveCustomCases = (cases: TestCaseItem[]) => {
    if (typeof window === "undefined") return;
    const customOnly = cases.filter((c) => c.source === "custom");
    localStorage.setItem(getCustomCasesKey(), JSON.stringify(customOnly));
  };

  // -- Action Handlers --
  const handleRunTest = async () => {
    if (!problem) return;

    setSubmitting(true);
    setError(null);

    try {
      const customCases = testCases
        .filter((tc) => tc.source === "custom")
        .map((tc) => ({ input: tc.input }));

      await testRun(problem.id, {
        language: activeLanguage,
        code,
        use_samples: true,
        custom_test_cases: customCases,
      });
    } catch (err: any) {
      setError(err.message || "測試執行失敗");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFullSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubmit(code, activeLanguage);
      if (result) {
        setIsSubmitModalOpen(false);
        setResultSubmissionId((result as SubmissionDetail).id);
        setIsResultModalOpen(true);
      }
    } catch (err: any) {
      setError(err.message || "提交失敗");
    } finally {
      setSubmitting(false);
    }
  };

  if (!problem) return null;

  const isAdmin = user && (user.role === "admin" || user.role === "teacher");
  const contentMaxWidth = "66rem";

  return (
    <div className="problem-detail-page">
      {/* Hero Section */}
      <ProblemHero
        problem={problem}
        maxWidth={contentMaxWidth}
        actions={
          <>
            {isAdmin && (
              <Button
                kind="tertiary"
                renderIcon={Edit}
                onClick={() => navigate(`/problems/${problem.id}/edit`)}
              >
                編輯
              </Button>
            )}
            <Button
              kind="primary"
              renderIcon={Code}
              onClick={() => navigate(`/problems/${problem.id}/solve`)}
            >
              全螢幕作答
            </Button>
          </>
        }
      />

      {/* Error Banner */}
      {error && (
        <div className="problem-detail-page__error-banner">
          <InlineNotification
            kind="error"
            title={tc("message.error")}
            subtitle={error}
            onClose={() => setError(null)}
          />
        </div>
      )}

      {/* Main Content - Stacked Sections */}
      <div className="problem-detail-page__content">
        {/* Section 1: Problem Description */}
        <section className="problem-detail-page__section">
          <ContainerCard
            title="題目描述"
            className="problem-detail-page__container problem-detail-page__container--no-padding"
          >
            <ProblemPreview
              problem={problem}
              showLanguageToggle={(problem.translations?.length ?? 0) > 1}
              compact={false}
            />
          </ContainerCard>
        </section>

        {/* Section 2: Code Submit */}
        <section className="problem-detail-page__section">
          <ProblemCodingTab
            code={code}
            setCode={setCode}
            language={activeLanguage}
            setLanguage={handleLanguageChange}
            languageConfigs={languageConfigs}
            testCases={testCases}
            onAddTestCase={handleAddTestCase}
            onDeleteTestCase={handleDeleteTestCase}
            onRunTest={handleRunTest}
            onSubmit={() => setIsSubmitModalOpen(true)}
            running={submitting}
            theme={theme}
          />
        </section>

        {/* Section 3: Discussion */}
        <section className="problem-detail-page__section">
          <ContainerCard title="討論區">
            <DiscussionList problemId={problem.id} />
          </ContainerCard>
        </section>

        {/* Section 4: Submission List */}
        <section className="problem-detail-page__section">
          <ContainerCard title="提交記錄" noPadding>
            <ProblemSubmissionList problemId={problem.id} />
          </ContainerCard>
        </section>

        {/* Section 5: Stats */}
        <section className="problem-detail-page__section">
          <ContainerCard title="解題統計">
            <ProblemStatsTab />
          </ContainerCard>
        </section>
      </div>

      {/* Submit Confirmation Modal */}
      <Modal
        open={isSubmitModalOpen}
        modalHeading={t("modal.confirmSubmit")}
        primaryButtonText={
          submitting ? t("modal.submitting") : tc("button.submit")
        }
        secondaryButtonText={tc("button.cancel")}
        onRequestClose={() => setIsSubmitModalOpen(false)}
        onRequestSubmit={handleFullSubmit}
        danger
      >
        <p>{t("modal.submitConfirmTitle")}</p>
        <p>{t("modal.submitConfirmMessage")}</p>
      </Modal>

      {/* Submission Result Modal */}
      <SubmissionDetailModal
        isOpen={isResultModalOpen}
        onClose={() => setIsResultModalOpen(false)}
        submissionId={resultSubmissionId}
      />
    </div>
  );
};

/**
 * ProblemDetailSection - Single page layout for problem detail
 * Displays all sections vertically: Problem, Code Submit, Discussion, Submissions, Stats
 */
const ProblemDetailSection: React.FC<ProblemDetailSectionProps> = ({
  problem,
  ...props
}) => {
  return (
    <ProblemProvider problemId={problem.id} initialProblem={problem}>
      <ProblemDetailSectionInner {...props} />
    </ProblemProvider>
  );
};

export default ProblemDetailSection;
