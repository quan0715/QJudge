import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type DemoJudgeStatus = "idle" | "running" | "done";
export type DemoLanguage = "python" | "cpp" | "java";

export interface DemoCaseResult {
  id: string;
  label: string;
  status: "AC" | "WA";
  timeMs: number;
}

const DEMO_CASES: Array<Pick<DemoCaseResult, "id" | "label">> = [
  { id: "case-1", label: "n = 1 -> 1" },
  { id: "case-2", label: "n = 2 -> 1" },
  { id: "case-3", label: "n = 10 -> 55" },
  { id: "case-4", label: "n = 20 -> 6765" },
];

const LANGUAGE_TEMPLATES: Record<DemoLanguage, string> = {
  python: `def solve(n: int) -> int:
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b`,
  cpp: `int solve(int n) {
  if (n <= 1) return n;
  int a = 0, b = 1;
  for (int i = 2; i <= n; ++i) {
    int next = a + b;
    a = b;
    b = next;
  }
  return b;
}`,
  java: `int solve(int n) {
  if (n <= 1) return n;
  int a = 0, b = 1;
  for (int i = 2; i <= n; i++) {
    int next = a + b;
    a = b;
    b = next;
  }
  return b;
}`,
};

const analyzeDemoCode = (code: string): DemoCaseResult["status"][] => {
  const normalizedCode = code.toLowerCase();
  const hasReturn = /return/.test(normalizedCode);
  const hasLoop = /(for|while)/.test(normalizedCode);
  const hasRecursion = /(solve\s*\()/.test(normalizedCode);

  if (hasReturn && (hasLoop || hasRecursion)) {
    return ["AC", "AC", "AC", "AC"];
  }

  if (hasReturn) {
    return ["AC", "WA", "WA", "AC"];
  }

  return ["WA", "WA", "AC", "AC"];
};

const buildResults = (code: string): DemoCaseResult[] => {
  const statuses = analyzeDemoCode(code);
  return DEMO_CASES.map((demoCase, index) => ({
    ...demoCase,
    status: statuses[index] ?? "WA",
    timeMs: 28 + index * 11,
  }));
};

export interface UseMiniJudgeDemoReturn {
  language: DemoLanguage;
  code: string;
  status: DemoJudgeStatus;
  isPreparing: boolean;
  visibleResults: DemoCaseResult[];
  totalResults: DemoCaseResult[];
  passedCount: number;
  canSubmit: boolean;
  onLanguageChange: (language: DemoLanguage) => void;
  onCodeChange: (code: string) => void;
  onSubmit: () => void;
}

export const useMiniJudgeDemo = (): UseMiniJudgeDemoReturn => {
  const [language, setLanguage] = useState<DemoLanguage>("python");
  const [code, setCode] = useState<string>(LANGUAGE_TEMPLATES.python);
  const [status, setStatus] = useState<DemoJudgeStatus>("idle");
  const [isPreparing, setIsPreparing] = useState(false);
  const [allResults, setAllResults] = useState<DemoCaseResult[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);

  const preparingTimerRef = useRef<number | null>(null);
  const revealIntervalRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (preparingTimerRef.current) {
      window.clearTimeout(preparingTimerRef.current);
      preparingTimerRef.current = null;
    }
    if (revealIntervalRef.current) {
      window.clearInterval(revealIntervalRef.current);
      revealIntervalRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const onLanguageChange = useCallback((nextLanguage: DemoLanguage) => {
    setLanguage(nextLanguage);
    setCode(LANGUAGE_TEMPLATES[nextLanguage]);
    setStatus("idle");
    setVisibleCount(0);
    setAllResults([]);
    setIsPreparing(false);
  }, []);

  const onCodeChange = useCallback((nextCode: string) => {
    setCode(nextCode);
  }, []);

  const onSubmit = useCallback(() => {
    clearTimers();

    const nextResults = buildResults(code);
    setAllResults(nextResults);
    setVisibleCount(0);
    setStatus("idle");
    setIsPreparing(true);

    preparingTimerRef.current = window.setTimeout(() => {
      setIsPreparing(false);
      setStatus("running");

      revealIntervalRef.current = window.setInterval(() => {
        setVisibleCount((currentCount) => {
          const nextCount = currentCount + 1;
          if (nextCount >= nextResults.length) {
            if (revealIntervalRef.current) {
              window.clearInterval(revealIntervalRef.current);
              revealIntervalRef.current = null;
            }
            setStatus("done");
            return nextResults.length;
          }
          return nextCount;
        });
      }, 250);
    }, 300);
  }, [clearTimers, code]);

  const visibleResults = useMemo(
    () => allResults.slice(0, visibleCount),
    [allResults, visibleCount]
  );

  const passedCount = useMemo(
    () => visibleResults.filter((result) => result.status === "AC").length,
    [visibleResults]
  );

  return {
    language,
    code,
    status,
    isPreparing,
    visibleResults,
    totalResults: allResults,
    passedCount,
    canSubmit: !isPreparing && status !== "running",
    onLanguageChange,
    onCodeChange,
    onSubmit,
  };
};

export default useMiniJudgeDemo;
