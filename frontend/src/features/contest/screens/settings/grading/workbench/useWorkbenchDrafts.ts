import { useEffect, useState, type SetStateAction } from "react";
import type { GradeDraft } from "./gradingWorkbenchModel";

type Drafts = Record<string, GradeDraft>;

function readDrafts(key: string): Drafts {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, draft]) =>
          draft &&
          typeof draft.score === "number" &&
          Number.isFinite(draft.score) &&
          typeof draft.feedback === "string",
      ),
    );
  } catch {
    return {};
  }
}

/** Keep this teacher's unsaved edits while visiting the matrix or legacy grading. */
export function useWorkbenchDrafts(contestId: string, userId: string) {
  const key = `grading-workbench:${userId}:${contestId}`;
  const [state, setState] = useState(() => ({ key, drafts: readDrafts(key) }));
  if (state.key !== key) setState({ key, drafts: readDrafts(key) });
  const drafts = state.key === key ? state.drafts : {};
  const setDrafts = (action: SetStateAction<Drafts>) =>
    setState((previous) => ({
      key,
      drafts:
        typeof action === "function"
          ? action(previous.key === key ? previous.drafts : {})
          : action,
    }));
  useEffect(() => {
    try {
      if (Object.keys(state.drafts).length)
        sessionStorage.setItem(state.key, JSON.stringify(state.drafts));
      else sessionStorage.removeItem(state.key);
    } catch {
      /* Browser storage can be unavailable; in-memory edits still work. */
    }
  }, [state]);
  return [drafts, setDrafts] as const;
}
