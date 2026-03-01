import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { getContest } from "@/infrastructure/api/repositories";
import type { ContestDetail } from "@/core/entities/contest.entity";

interface PaperExamContextType {
  contest: ContestDetail | null;
  loading: boolean;
  error: string | null;
  refreshContest: () => Promise<void>;
}

const PaperExamContext = createContext<PaperExamContextType | undefined>(undefined);

interface PaperExamProviderProps {
  children: ReactNode;
}

export const PaperExamProvider: React.FC<PaperExamProviderProps> = ({ children }) => {
  const { contestId } = useParams<{ contestId: string }>();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContest = useCallback(async () => {
    if (!contestId) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await getContest(contestId);
      setContest(data || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load contest";
      setError(message);
      setContest(null);
    }
  }, [contestId]);

  const refreshContest = useCallback(async () => {
    await fetchContest();
  }, [fetchContest]);

  useEffect(() => {
    if (contestId) {
      const init = async () => {
        setLoading(true);
        await fetchContest();
        setLoading(false);
      };
      init();
    }
  }, [contestId, fetchContest]);

  const value = useMemo(
    () => ({ contest, loading, error, refreshContest }),
    [contest, loading, error, refreshContest],
  );

  return (
    <PaperExamContext.Provider value={value}>{children}</PaperExamContext.Provider>
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
