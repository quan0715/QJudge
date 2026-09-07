import { createContext } from "react";

import type { ExamItem } from "@/features/contest/types/exam.types";

export interface ContestRuntimeNavigatorState {
  coding?: boolean;
  activeTabIndex?: number;
  statementCollapsed?: boolean;
  closeStatement?: () => void;
  selectTab?: (index: number) => void;
  items: ExamItem[];
  activeIndex: number;
  answeredIds: Set<string>;
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
