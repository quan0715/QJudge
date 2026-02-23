import { useState, useEffect, useCallback } from "react";
import { submitSolution, getSubmission } from "@/infrastructure/api/repositories/submission.repository";
import { testRun } from "@/infrastructure/api/repositories/problem.repository";
import { useInterval } from "@/shared/hooks/useInterval";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import type { TestCaseItem } from "@/core/entities/testcase.entity";
import {
  LANGUAGE_OPTIONS,
  DEFAULT_TEMPLATES,
} from "@/features/problems/constants/codeTemplates";
import type {
  ResultMode,
  ExecutionState,
  TestRunResult,
  SubmissionResult,
  TestCaseResult,
  ExecutionStatus,
  ExecutionType,
} from "@/core/types/solver.types";
import { INITIAL_EXECUTION_STATE } from "@/core/types/solver.types";
import { transformSubmissionToResult, transformTestRunToResult } from "./solverAdapters";
import { loadCode, loadCustomCases, saveCode, saveCustomCases as persistCustomCases } from "./solverStorage";

export type { ResultMode, ExecutionState, SubmissionResult, TestCaseResult, ExecutionStatus, ExecutionType };
export type TestResult = TestRunResult;

interface UseProblemSolverProps {
  /** The problem to solve - can be provided directly or loaded */
  problem: ProblemDetail | null;
  /** Optional contest ID for contest mode */
  contestId?: string;
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
  
  // Error state
  error: string | null;
}

/**
 * useProblemSolver - Core hook for problem solving UI
 * 
 * Supports both standalone problem mode and contest mode.
 * Manages code state, test cases, and execution.
 */
export function useProblemSolver({
  problem,
  contestId,
}: UseProblemSolverProps): UseProblemSolverReturn {
  // Result panel state
  const [resultOpen, setResultOpen] = useState(false);
  const [resultMode, setResultMode] = useState<ResultMode>("testcases");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Code state
  const [code, setCode] = useState<string>("");
  const [language, setLanguage] = useState<string>("cpp");
  
  // Language configs (internal use only for template loading)
  const [languageConfigs, setLanguageConfigs] = useState<{ language: string; templateCode: string; isEnabled: boolean }[]>([]);

  // Test cases
  const [testCases, setTestCases] = useState<TestCaseItem[]>([]);

  // Unified Execution State
  const [executionState, setExecutionState] = useState<ExecutionState>(INITIAL_EXECUTION_STATE);

  // Initialize when problem changes
  useEffect(() => {
    if (!problem) return;

    // Reset execution on problem change
    setExecutionState(INITIAL_EXECUTION_STATE);
    setError(null);

    // Setup language configs
    let configs = problem.languageConfigs || [];
    if (configs.length === 0) {
      configs = LANGUAGE_OPTIONS.map((opt) => ({
        language: opt.id,
        templateCode: DEFAULT_TEMPLATES[opt.id] || "",
        isEnabled: true,
      }));
    }
    setLanguageConfigs(configs);

    // Load saved code
    const targetLang = configs.find((c) => c.language === language)
      ? language
      : configs.find((c) => c.isEnabled)?.language || "cpp";
    
    setLanguage(targetLang);

    const savedCode = loadCode(problem.id, targetLang, contestId);
    if (savedCode) {
      setCode(savedCode);
    } else {
      const tmpl = configs.find((c) => c.language === targetLang)?.templateCode;
      setCode(tmpl || "");
    }

    // Load test cases
    const publicCases: TestCaseItem[] = (problem.testCases || [])
      .filter((tc) => tc.isSample)
      .map((tc, idx) => ({
        id: `public_${idx}`,
        input: tc.input,
        output: tc.output,
        isSample: true,
        source: "public" as const,
        enabled: true,
      }));

    const customCases = loadCustomCases(problem.id, contestId);

    setTestCases([...publicCases, ...customCases]);
  }, [problem?.id, contestId]);

  // Save code
  useEffect(() => {
    if (problem?.id && code && language) {
      saveCode(problem.id, language, code, contestId);
    }
  }, [code, language, problem?.id, contestId]);

  // Save custom cases
  const saveCustomCases = useCallback(
    (cases: TestCaseItem[]) => {
      if (!problem?.id) return;
      const customOnly = cases.filter((c) => c.source === "custom");
      persistCustomCases(problem.id, customOnly, contestId);
    },
    [problem?.id, contestId]
  );

  const toggleResult = useCallback(() => {
    setResultOpen((prev) => !prev);
  }, []);

  const selectCase = useCallback((id: string | null) => {
    setSelectedCaseId(id);
  }, []);

  const handleLanguageChange = useCallback(
    (newLang: string) => {
      if (!problem?.id) return;
      setLanguage(newLang);
      const savedCode = loadCode(problem.id, newLang, contestId);
      if (savedCode) {
        setCode(savedCode);
      } else {
        const tmpl = languageConfigs.find((c) => c.language === newLang)?.templateCode;
        setCode(tmpl || "");
      }
    },
    [problem?.id, languageConfigs, contestId]
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

  // Execute test run using the dedicated test-run endpoint
  const executeTestRun = useCallback(async () => {
    if (!problem?.id) return;

    setExecutionState({
      type: 'test',
      status: 'running',
      result: null
    });

    try {
      // Prepare custom test cases - only send input (not output)
      const customCases = testCases
        .filter((tc) => tc.source === "custom")
        .map((tc) => ({ input: tc.input }));

      const result = await testRun(problem.id, {
        language,
        code,
        use_samples: true, // Include sample test cases
        custom_test_cases: customCases,
      });

      // Test run returns immediately (no polling needed)
      const resObj = transformTestRunToResult(result);
      setExecutionState({
        type: 'test',
        status: 'complete',
        result: resObj
      });
    } catch (err: any) {
      setExecutionState({
        type: 'test',
        status: 'error',
        result: null,
        error: err.message || "測試執行失敗"
      });
    }
  }, [problem?.id, code, language, testCases]);

  // Execute formal submission
  const executeSubmit = useCallback(async () => {
    if (!problem?.id) return;

    setExecutionState({
      type: 'submit',
      status: 'running',
      result: null
    });

    try {
      const payload: {
        problem_id: string;
        language: string;
        code: string;
        contest_id?: string;
      } = {
        problem_id: problem.id,
        language,
        code,
      };

      // Add contest_id if in contest mode
      if (contestId) {
        payload.contest_id = contestId;
      }

      const result = await submitSolution(payload);

      if (result) {
        // Check if pending (using backend lowercase types)
        const isPending = result.status === "pending" || result.status === "judging";
        
        if (isPending) {
          setExecutionState({
            type: 'submit',
            status: 'polling',
            result: transformSubmissionToResult(result),
            pollingId: result.id
          });
        } else {
          // Success immediate
          setExecutionState({
            type: 'submit',
            status: 'complete',
            result: transformSubmissionToResult(result)
          });
        }
      }
    } catch (err: any) {
      setExecutionState({
        type: 'submit',
        status: 'error',
        result: null,
        error: err.message || "提交失敗"
      });
    }
  }, [problem?.id, contestId, code, language]);

  const runTest = useCallback(() => {
    setResultOpen(true);
    setResultMode('results');
    return executeTestRun();
  }, [executeTestRun]);
  
  const submit = useCallback(() => {
    setResultOpen(true);
    setResultMode('results');
    return executeSubmit();
  }, [executeSubmit]);

  // Polling Effect - only for formal submissions (test runs don't need polling)
  useInterval(() => {
    if (executionState.status !== 'polling' || !executionState.pollingId) return;
    
    getSubmission(executionState.pollingId)
      .then((data) => {
        if (!data) return;
        const isPending = data.status === "pending" || data.status === "judging";
        
        if (!isPending) {
          setExecutionState(prev => ({
            ...prev,
            status: 'complete',
            pollingId: undefined,
            result: transformSubmissionToResult(data)
          }));
        } else {
          setExecutionState(prev => ({
            ...prev,
            result: transformSubmissionToResult(data)
          }));
        }
      })
      .catch(err => {
        setExecutionState(prev => ({
          ...prev,
          status: 'error',
          pollingId: undefined,
          error: "無法獲取結果: " + (err.message || "Unknown error")
        }));
      });

  }, executionState.status === 'polling' ? 2000 : null);

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
    testCases,
    addTestCase,
    updateTestCase,
    deleteTestCase,
    runTest,
    submit,
    executionState,
    error,
  };
}

export default useProblemSolver;
