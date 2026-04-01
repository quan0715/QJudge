import { useQuery } from "@tanstack/react-query";
import {
  getCurrentSubscription,
  type SubscriptionData,
} from "@/infrastructure/api/repositories/subscription.repository";

/**
 * Fetches subscription details from the backend (which syncs from Recur API).
 *
 * For UI gating (show/hide features), prefer `useEntitlement()` instead —
 * it reads directly from Recur SDK and doesn't depend on localStorage.
 *
 * This hook is useful when you need backend-synced details like
 * period dates or the Recur subscription ID.
 */
export function useSubscription() {
  return useQuery<SubscriptionData>({
    queryKey: ["subscription", "me"],
    queryFn: async () => {
      const res = await getCurrentSubscription();
      return res.data;
    },
    refetchOnMount: "always",
  });
}
