import React, {
  createContext,
  useContext,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import type { ContestDetail, ScoreboardData } from "@/core/entities/contest.entity";
import { ContestProvider, useContest } from "@/features/contest/contexts/ContestContext";

interface PaperExamContextType {
  contest: ContestDetail | null;
  loading: boolean;
  error: string | null;
  refreshContest: () => Promise<void>;
}

const PaperExamContext = createContext<PaperExamContextType | undefined>(undefined);

interface PaperExamProviderProps {
  children: ReactNode;
  contestId?: string;
  initialContest?: ContestDetail | null;
  initialScoreboardData?: ScoreboardData | null;
  onRefresh?: () => Promise<void>;
}

const PaperExamContextBridge: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { contest, loading, error, refreshContest } = useContest();

  const value = useMemo(
    () => ({ contest, loading, error, refreshContest }),
    [contest, loading, error, refreshContest],
  );

  return (
    <PaperExamContext.Provider value={value}>{children}</PaperExamContext.Provider>
  );
};

export const PaperExamProvider: React.FC<PaperExamProviderProps> = ({
  children,
  contestId: propContestId,
  initialContest,
  initialScoreboardData,
  onRefresh,
}) => {
  const params = useParams<{ contestId: string }>();
  const contestId = propContestId || params.contestId;

  return (
    <ContestProvider
      contestId={contestId}
      initialContest={initialContest}
      initialScoreboardData={initialScoreboardData}
      onRefresh={onRefresh}
    >
      <PaperExamContextBridge>{children}</PaperExamContextBridge>
    </ContestProvider>
  );
};

export const usePaperExam = (): PaperExamContextType => {
  const context = useContext(PaperExamContext);
  if (context === undefined) {
    throw new Error("usePaperExam must be used within a PaperExamProvider");
  }
  return context;
};

export default PaperExamContext;
