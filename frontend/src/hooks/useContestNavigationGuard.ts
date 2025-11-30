import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hook to warn users before leaving contest pages
 * Uses beforeunload for browser navigation
 * @param contestId - The ID of the current contest
 * @param enabled - Whether the guard is enabled (default: true)
 */
export const useContestNavigationGuard = (contestId: string | undefined, enabled: boolean = true) => {
  const location = useLocation();

  useEffect(() => {
    if (!enabled || !contestId) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const contestPath = `/contests/${contestId}`;
      if (location.pathname.startsWith(contestPath)) {
        e.preventDefault();
        e.returnValue = ''; // Modern browsers ignore custom messages
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [contestId, enabled, location.pathname]);

  // Return empty object for API compatibility
  return { state: 'unblocked' as const };
};
