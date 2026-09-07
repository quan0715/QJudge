import { useMemo, useState, useCallback } from "react";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import { useRegisterContestRuntimeNavigator } from "../contexts/useContestRuntimeNavigator";

export function useCodingRuntimeNavigator(
  problems: ContestProblemSummary[],
  selectedId: string | null | undefined,
  answeredIds: Set<string>,
  selectProblem: (id: string) => void,
) {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const selectTab = useCallback((index: number) => {
    setActiveTabIndex(index);
    setCollapsed(false);
  }, []);
  const closeStatement = useCallback(() => setCollapsed(true), []);
  const state = useMemo(() => problems.length ? {
    coding: true,
    statementCollapsed: collapsed,
    closeStatement,
    activeTabIndex,
    selectTab,
    items: problems.map((data) => ({ kind: "coding" as const, data })),
    activeIndex: Math.max(0, problems.findIndex((p) => p.id === selectedId)),
    answeredIds,
    onSelect: (index: number) => { if (problems[index]) { selectProblem(problems[index].id); selectTab(0); } },
  } : null, [problems, selectedId, answeredIds, selectProblem, activeTabIndex, selectTab, collapsed, closeStatement]);
  useRegisterContestRuntimeNavigator(state, problems.length > 0);
  return { activeTabIndex, selectTab, collapsed, setCollapsed };
}
