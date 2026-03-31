import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { PENDING_ACTIONS } from "./registry";
import { getPendingAction, storePendingAction } from "./storage";

interface UsePendingActionsResult {
  /** The banner to show on login/register, or null if no pending action */
  activeBanner: { titleKey: string; subtitleKey: string } | null;
  /** Build a link (e.g. "/register") with query params for pending actions */
  buildAuthLink: (basePath: string) => string;
}

/**
 * Hook for login/register screens.
 * - Auto-syncs URL query params → sessionStorage for actions that use queryParam
 * - Returns banner info for the highest-priority active pending action
 * - Returns a link builder that threads query params between login↔register
 */
export const usePendingActions = (): UsePendingActionsResult => {
  const [searchParams] = useSearchParams();

  // Sync query params → sessionStorage (runs on every render, but writes are idempotent)
  const queryParamValues = useMemo(() => {
    const result: Record<string, string> = {};
    for (const action of PENDING_ACTIONS) {
      if (!action.queryParam) continue;
      const value = (searchParams.get(action.queryParam) || "").trim();
      if (value) {
        storePendingAction(action.storageKey, value);
        result[action.queryParam] = value;
      }
    }
    return result;
  }, [searchParams]);

  // Find the highest-priority active pending action for the banner
  const activeBanner = useMemo(() => {
    const sorted = [...PENDING_ACTIONS].sort((a, b) => a.priority - b.priority);
    for (const action of sorted) {
      // Check query param first (takes priority over storage for current session)
      if (action.queryParam && queryParamValues[action.queryParam]) {
        return action.banner;
      }
      if (getPendingAction(action.storageKey)) {
        return action.banner;
      }
    }
    return null;
  }, [queryParamValues]);

  // Build auth links with query params threaded through
  const buildAuthLink = useMemo(() => {
    // Collect all active query params (from URL or sessionStorage)
    const params = new URLSearchParams();
    for (const action of PENDING_ACTIONS) {
      if (!action.queryParam) continue;
      const fromUrl = queryParamValues[action.queryParam];
      const fromStorage = getPendingAction(action.storageKey);
      const value = fromUrl || fromStorage;
      if (value) params.set(action.queryParam, value);
    }
    const qs = params.toString();

    return (basePath: string) => (qs ? `${basePath}?${qs}` : basePath);
  }, [queryParamValues]);

  return { activeBanner, buildAuthLink };
};
