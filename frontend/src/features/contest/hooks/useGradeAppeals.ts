import { useCallback, useEffect, useRef, useState } from "react";
import type { GradeAppeal } from "@/core/entities/gradeAppeal.entity";
import { getGradeAppeals } from "@/infrastructure/api/repositories/gradeAppeals.repository";
import { EnvelopeError } from "@/infrastructure/api/envelope";

export function useGradeAppeals(contestId: string, enabled: boolean, refreshKey = 0) {
  const [appeals, setAppeals] = useState<GradeAppeal[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const updateVersion = useRef(0);
  const updatedAt = useRef(new Map<number, number>());
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    const startedAt = updateVersion.current;
    if (!enabled) { setAppeals([]); setLoading(false); setError(""); return; }
    setLoading(true);
    try {
      const data = await getGradeAppeals(contestId);
      if (version === generation.current) {
        setAppeals(current => {
          const latest = new Map(current.map(appeal => [appeal.id, appeal]));
          // Preserve per-ticket updates received after this list request started.
          return data.map(appeal => (updatedAt.current.get(appeal.id) ?? 0) > startedAt
            ? latest.get(appeal.id) ?? appeal : appeal);
        });
        setError("");
      }
    } catch (e) {
      if (version === generation.current) {
        // Keep drafts mounted on transient refresh failures; never keep private data after access is lost.
        if ((e instanceof EnvelopeError && e.status < 500) || (e instanceof Error && e.message === "Unauthorized")) {
          setAppeals([]);
        }
        setError(e instanceof Error ? e.message : "申訴載入失敗");
      }
    } finally { if (version === generation.current) setLoading(false); }
  }, [contestId, enabled]);
  useEffect(() => { void refresh(); return () => { generation.current += 1; }; }, [refresh, refreshKey]);
  const updateAppeal = useCallback((updated: GradeAppeal) => {
    updatedAt.current.set(updated.id, ++updateVersion.current);
    setAppeals(current => current.map(appeal => appeal.id === updated.id ? updated : appeal));
  }, []);
  return { appeals: enabled ? appeals : [], loading, error, refresh, updateAppeal };
}
