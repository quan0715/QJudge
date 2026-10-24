import { useSubmission } from "./useSubmission";
import { useState, useEffect, useCallback, useMemo } from "react";
import type { CodingProblemDetail } from "@/core/entities/problem.entity";
import type { TestCaseItem } from "@/core/entities/testcase.entity";
import {
  LANGUAGE_OPTIONS,
  DEFAULT_TEMPLATES,
} from "@/features/problems/constants/codeTemplates";
import { getLanguageConfig } from "@/core/config/language.config";
import type {
  ResultMode,
  ExecutionState,
  TestRunResult,
  SubmissionResult,
  TestCaseResult,
  ExecutionStatus,
  ExecutionType,
} from "@/core/types/solver.types";
import { loadCode, loadCustomCases, saveCode, saveCustomCases as persistCustomCases } from "./solverStorage";
import { useWatchProblem } from "@/features/problems/contexts/useJudgeQueue";

export type { ResultMode, ExecutionState, SubmissionResult, TestCaseResult, ExecutionStatus, ExecutionType };
export type TestResult = TestRunResult;

interface UseProblemSolverProps {
  /** The problem to solve - can be provided directly or loaded */
  problem: CodingProblemDetail | null;
  /** Contest that owns this solve session */
  contestId: string;
  userId: string | null;
  /** Problem label (e.g. "A") for contest mode */
  problemLabel?: string;
}

interface UseProblemSolverReturn {
  // Result panel state
  resultOpen: boolean;
  toggleResult: () => void;
  resultMode: ResultMode;
  setResultMode: (mode: ResultMode) => void;
  selectedCaseId: string | null;
  selectCase: (id: string | null) => void;
  
  // Code state
  code: string;
  setCode: (code: string) => void;
  language: string;
  setLanguage: (lang: string) => void;
  languageOptions: Array<{ id: string; label: string }>;
  
  // Test cases
  testCases: TestCaseItem[];
  addTestCase: (input: string, output: string) => void;
  updateTestCase: (id: string, input: string, output: string) => void;
  deleteTestCase: (id: string) => void;
  
  // Actions
  runTest: () => Promise<void>;
  submit: () => Promise<void>;
  
  // Unified State
  executionState: ExecutionState;
  /** This problem has a submission still waiting for its verdict. */
  hasPendingSubmission: boolean;
  testRunning: boolean;
  submitting: boolean;
  
  // Error state
  error: string | null;
}

/**
 * useProblemSolver - Core hook for problem solving UI
 * 
 * Manages code state, test cases, and execution for a contest-bound problem.
 */
export function useProblemSolver({
  problem,
  contestId,
  userId,
}: UseProblemSolverProps): UseProblemSolverReturn {
  // Result panel state
  // The student's panel choices, kept for the showing they were made on: every showing of a run
  // (a new run, or 查看 on its notification) opens on its result.
  const [panelChoice, setPanelChoice] = useState<{ showing?: number; open?: boolean; mode?: ResultMode }>({});
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Code state
  const [code, setCode] = useState<string>("");
  const [language, setLanguage] = useState<string>("cpp");
  
  // Language configs (internal use only for template loading)
  const [languageConfigs, setLanguageConfigs] = useState<{ language: string; templateCode: string; isEnabled: boolean }[]>([]);
  const languageOptions = useMemo(
    () =>
      languageConfigs
        .filter((cfg) => cfg.isEnabled)
        .map((cfg) => ({
          id: cfg.language,
          label: getLanguageConfig(cfg.language).label,
        })),
    [languageConfigs]
  );

  // Test cases
  const [testCases, setTestCases] = useState<TestCaseItem[]>([]);

  // Unified Execution State
  const customTestCases = useMemo(
    () => testCases
      .filter((testCase) => testCase.source === "custom")
      .map((testCase) => ({ input: testCase.input, expected_output: testCase.output ?? "" })),
    [testCases],
  );
  const { executionState, showing, execute, hasPendingSubmission, testRunning, submitting } = useSubmission({ problemId: problem?.id, contestId, code, language, customTestCases });
  const hasRun = executionState.status !== "idle";
  const choice = panelChoice.showing === showing ? panelChoice : {};
  const resultOpen = choice.open ?? hasRun;
  const resultMode = choice.mode ?? (hasRun ? "results" : "testcases");
  const choose = useCallback((next: { open?: boolean; mode?: ResultMode }) => {
    setPanelChoice((previous) => ({ ...(previous.showing === showing ? previous : {}), showing, ...next }));
  }, [showing]);
  const setResultOpen = useCallback((open: boolean) => choose({ open }), [choose]);
  const setResultMode = useCallback((mode: ResultMode) => choose({ mode }), [choose]);
  useWatchProblem(problem?.id, resultOpen && resultMode === "results");

  // Initialize when problem changes
  useEffect(() => {
    if (!problem) return;

    // Reset execution on problem change
    setError(null);

    // Setup language configs
    let configs = (problem.languageConfigs || [])
      .map((cfg) => ({
        language: String(cfg.language || "").trim(),
        templateCode: cfg.templateCode || "",
        isEnabled: cfg.isEnabled !== false,
      }))
      .filter((cfg) => Boolean(cfg.language));

    if (configs.length === 0) {
      configs = LANGUAGE_OPTIONS.map((opt) => ({
        language: opt.id,
        templateCode: DEFAULT_TEMPLATES[opt.id] || "",
        isEnabled: true,
      }));
    }
    setLanguageConfigs(configs);

    // Load saved code
    const targetLang = configs.find((c) => c.language === language && c.isEnabled)
      ? language
      : configs.find((c) => c.isEnabled)?.language || configs[0]?.language || "cpp";
    
    setLanguage(targetLang);

    const savedCode = userId ? loadCode(problem.id, targetLang, contestId, userId) : null;
    if (savedCode) {
      setCode(savedCode);
    } else {
      const tmpl = configs.find((c) => c.language === targetLang)?.templateCode;
      setCode(tmpl || DEFAULT_TEMPLATES[targetLang] || "");
    }

    // Load test cases
    // Same cases, same order as the backend test run: public samples only.
    const publicCases: TestCaseItem[] = (problem.testCases || [])
      .filter((tc) => tc.isSample && !tc.isHidden)
      .map((tc, idx) => ({
        id: `public_${idx}`,
        input: tc.input,
        output: tc.output,
        isSample: true,
        source: "public" as const,
        enabled: true,
      }));

    const customCases = userId ? loadCustomCases(problem.id, contestId, userId) : [];

    setTestCases([...publicCases, ...customCases]);
  }, [problem?.id, contestId, userId]);

  // Save code
  useEffect(() => {
    if (userId && problem?.id && code && language) {
      saveCode(problem.id, language, code, contestId, userId);
    }
  }, [code, language, problem?.id, contestId, userId]);

  // Save custom cases
  const saveCustomCases = useCallback(
    (cases: TestCaseItem[]) => {
      if (!problem?.id || !userId) return;
      const customOnly = cases.filter((c) => c.source === "custom");
      persistCustomCases(problem.id, customOnly, contestId, userId);
    },
    [problem?.id, contestId, userId]
  );

  const toggleResult = useCallback(() => {
    setResultOpen(!resultOpen);
  }, [resultOpen, setResultOpen]);

  const selectCase = useCallback((id: string | null) => {
    setSelectedCaseId(id);
  }, []);

  const handleLanguageChange = useCallback(
    (newLang: string) => {
      if (!problem?.id) return;
      const selected = languageConfigs.find(
        (cfg) => cfg.language === newLang && cfg.isEnabled
      );
      if (!selected) return;

      setLanguage(newLang);
      const savedCode = userId ? loadCode(problem.id, newLang, contestId, userId) : null;
      if (savedCode) {
        setCode(savedCode);
      } else {
        setCode(selected.templateCode || DEFAULT_TEMPLATES[newLang] || "");
      }
    },
    [problem?.id, languageConfigs, contestId, userId]
  );

  const addTestCase = useCallback(
    (input: string, output: string) => {
      const newCase: TestCaseItem = {
        id: `custom_${Date.now()}`,
        input,
        output,
        source: "custom" as const,
      };
      setTestCases((prev) => {
        const next = [...prev, newCase];
        saveCustomCases(next);
        return next;
      });
    },
    [saveCustomCases]
  );

  const updateTestCase = useCallback(
    (id: string, input: string, output: string) => {
      setTestCases((prev) => {
        const next = prev.map((tc) => 
          tc.id === id ? { ...tc, input, output } : tc
        );
        saveCustomCases(next);
        return next;
      });
    },
    [saveCustomCases]
  );

  const deleteTestCase = useCallback(
    (id: string) => {
      setTestCases((prev) => {
        const next = prev.filter((tc) => tc.id !== id);
        saveCustomCases(next);
        return next;
      });
    },
    [saveCustomCases]
  );

  const runTest = useCallback(() => {
    setResultOpen(true);
    setResultMode('results');
    return execute('test');
  }, [execute]);

  const submit = useCallback(() => {
    setResultOpen(true);
    setResultMode('results');
    return execute('submit');
  }, [execute]);

  return {
    resultOpen,
    toggleResult,
    resultMode,
    setResultMode,
    selectedCaseId,
    selectCase,
    code,
    setCode,
    language,
    setLanguage: handleLanguageChange,
    languageOptions,
    testCases,
    addTestCase,
    updateTestCase,
    deleteTestCase,
    runTest,
    submit,
    executionState,
    hasPendingSubmission,
    testRunning,
    submitting,
    error,
  };
}

export default useProblemSolver;
