import { useCallback, useEffect, useRef, useState } from "react";
import type { GradeAppeal } from "@/core/entities/gradeAppeal.entity";
import { getGradeAppeals } from "@/infrastructure/api/repositories/gradeAppeals.repository";

export function useGradeAppeals(contestId: string, enabled: boolean) {
  const [appeals, setAppeals] = useState<GradeAppeal[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    if (!enabled) { setAppeals([]); setLoading(false); setError(""); return; }
    setLoading(true);
    try {
      const data = await getGradeAppeals(contestId);
      if (version === generation.current) { setAppeals(data); setError(""); }
    } catch (e) {
      if (version === generation.current) { setAppeals([]); setError(e instanceof Error ? e.message : "申訴載入失敗"); }
    } finally { if (version === generation.current) setLoading(false); }
  }, [contestId, enabled]);
  useEffect(() => { void refresh(); return () => { generation.current += 1; }; }, [refresh]);
  return { appeals: enabled ? appeals : [], loading, error, refresh };
}
