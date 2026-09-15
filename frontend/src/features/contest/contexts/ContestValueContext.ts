import { createContext } from "react";
import type { ContestDetail, ScoreboardData } from "@/core/entities/contest.entity";
import type { useExamRuntimeState } from "../hooks/useExamRuntimeState";

export interface ContestContextType {
  runtime: ReturnType<typeof useExamRuntimeState>;
  contest: ContestDetail | null;
  loading: boolean;
  error: string | null;
  scoreboardData: ScoreboardData | null;
  standingsLoading: boolean;
  isRefreshing: boolean;
  refreshContest: () => Promise<void>;
  refreshStandings: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const ContestContext = createContext<ContestContextType | undefined>(undefined);

export default ContestContext;
