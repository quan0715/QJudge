import { createContext } from "react";

import type { ExamItem } from "@/features/contest/types/exam.types";
import type { JudgeProblemStatus } from "@/features/problems/contexts/judgeQueueStore";

export interface ContestRuntimeNavigatorState {
  coding?: boolean;
  activeTabIndex?: number;
  statementCollapsed?: boolean;
  selectTab?: (index: number) => void;
  items: ExamItem[];
  activeIndex: number;
  answeredIds: Set<string>;
  /** This session's judging state per CodingProblem.id */
  judgeStatuses?: Record<string, JudgeProblemStatus>;
  markedIds?: Set<string>;
  overviewLabel?: string;
  onSelect: (index: number) => void;
  onSelectOverview?: () => void;
}

export interface ContestRuntimeNavigatorContextValue {
  navigator: ContestRuntimeNavigatorState | null;
  setNavigator: (state: ContestRuntimeNavigatorState | null) => void;
}

export const ContestRuntimeNavigatorContext =
  createContext<ContestRuntimeNavigatorContextValue | null>(null);
