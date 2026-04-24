import { useEffect, useMemo, useRef, useState } from "react";
import { findLatestTaskSession } from "@/features/ai-tasks/lib/aiTaskRuntime";

interface TaskSessionCandidate {
  id: string;
  context?: Record<string, unknown> | null;
}

export interface UseTaskSessionOptions {
  taskType: string;
  /** 當前題目/物件對應的 task context；null 表示尚未準備好，暫停 auto-bind。 */
  taskContext: Record<string, string> | null;
  sessions: ReadonlyArray<TaskSessionCandidate>;
  isLoadingSessions: boolean;
  /** 已綁定的 session id；null 代表沒綁。 */
  boundSessionId: string | null;
  /** 若 boundSessionId 已對應當前 taskContext，就不再 auto-bind。 */
  isBoundForCurrentContext: boolean;
  /** 外部前置條件（例如 rows 是否已 ready），false 時跳過 auto-bind。 */
  enabled: boolean;
  /** 代表「同一輪 attempt」的 key（taskContext 的穩定字串化）。key 改變才會重跑 auto-bind。 */
  resolveKey: string | null;
  /** 找到 match 的 session 時執行，回傳最終綁定後的 session id（通常 = matched），null 表示失敗/取消。 */
  onMatch(matchedSessionId: string): Promise<string | null>;
  /** 沒有 match 的 session 時執行（通常是 createSession()）；每個 resolveKey 只會觸發一次。 */
  onEmpty?(): Promise<string | null>;
  /** 任一路徑解析出 sessionId 後呼叫，給 consumer 做後續動作（例如寫入 `?ai_session_id=` URL / 打開 chat panel）。 */
  onSessionResolved?(sessionId: string): void;
}

export interface UseTaskSessionResult {
  pendingBindSessionId: string;
  setPendingBindSessionId(id: string): void;
  /** 正在 resolve 中（尚未決定 match 或 empty）。Consumer 可顯示 loading。 */
  resolving: boolean;
}

/**
 * 管理 AI Task 的 session auto-bind 邏輯：
 * - 依 `resolveKey` 掃 sessions，找時間最近且 task_type / context 吻合者；
 * - 找到 → 呼叫 `onMatch`（通常是 restore）；失敗視為無 match。
 * - 沒找到 → 呼叫 `onEmpty`（通常是 createSession）以開空 session；每個 resolveKey 僅一次。
 * - 同步 `pendingBindSessionId` 與 `boundSessionId`（供 dropdown 顯示）。
 *
 * 不擁有 task state，caller 透過 callbacks 決定 match/empty 時的行為。
 */
export function useTaskSession(options: UseTaskSessionOptions): UseTaskSessionResult {
  const {
    taskType,
    taskContext,
    sessions,
    isLoadingSessions,
    boundSessionId,
    isBoundForCurrentContext,
    enabled,
    resolveKey,
  } = options;

  const [pendingBindSessionId, setPendingBindSessionId] = useState("");
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (boundSessionId) setPendingBindSessionId(boundSessionId);
  }, [boundSessionId]);

  const onMatchRef = useRef(options.onMatch);
  const onEmptyRef = useRef(options.onEmpty);
  const onResolvedRef = useRef(options.onSessionResolved);
  useEffect(() => {
    onMatchRef.current = options.onMatch;
    onEmptyRef.current = options.onEmpty;
    onResolvedRef.current = options.onSessionResolved;
  });

  const sessionsSignature = useMemo(
    () => sessions.map((session) => session.id).join("|"),
    [sessions],
  );

  const attemptKeyRef = useRef<string | null>(null);
  const emptyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !resolveKey || !taskContext) {
      setResolving(false);
      return;
    }
    if (boundSessionId && isBoundForCurrentContext) {
      setResolving(false);
      return;
    }
    if (isLoadingSessions) {
      setResolving(true);
      return;
    }
    const attemptKey = `${resolveKey}::${sessionsSignature}`;
    if (attemptKeyRef.current === attemptKey) {
      setResolving(false);
      return;
    }
    attemptKeyRef.current = attemptKey;
    setResolving(true);

    const matched = findLatestTaskSession({ sessions, taskType, context: taskContext });

    void (async () => {
      try {
        if (attemptKeyRef.current !== attemptKey) return;
        if (!matched) {
          if (emptyKeyRef.current === resolveKey) return;
          emptyKeyRef.current = resolveKey;
          const newId = (await onEmptyRef.current?.()) ?? null;
          if (attemptKeyRef.current !== attemptKey || !newId) return;
          onResolvedRef.current?.(newId);
          return;
        }
        const resolvedId = await onMatchRef.current(matched);
        if (attemptKeyRef.current !== attemptKey) return;
        if (resolvedId) {
          emptyKeyRef.current = null;
          setPendingBindSessionId(resolvedId);
          onResolvedRef.current?.(resolvedId);
        }
      } finally {
        // 永遠清 loading：被新 attempt 覆寫也無所謂，下一輪會 setResolving(true)。
        setResolving(false);
      }
    })();
  }, [
    enabled,
    resolveKey,
    taskContext,
    taskType,
    boundSessionId,
    isBoundForCurrentContext,
    isLoadingSessions,
    sessions,
    sessionsSignature,
  ]);

  return { pendingBindSessionId, setPendingBindSessionId, resolving };
}
