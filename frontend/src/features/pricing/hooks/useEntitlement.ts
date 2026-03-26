/**
 * useEntitlement — frontend subscription status from Recur SDK.
 *
 * This is the **primary source of truth for UI gating**.
 * It reads directly from Recur (not localStorage), so it's always fresh.
 *
 * For server-side access control, the backend syncs independently
 * via /subscriptions/me/ → Recur API.
 */

import { useCustomer } from "recur-tw";

export type SubscriptionTier = "free" | "pro" | "team";

interface EntitlementInfo {
  /** Whether Recur entitlements are still loading */
  isLoading: boolean;
  /** Resolved tier based on Recur entitlements */
  tier: SubscriptionTier;
  /** Subscription status from Recur */
  status: string | null;
  /** Whether user has any paid entitlement (pro or team) */
  isPaid: boolean;
  /** Whether user is in trial period */
  isTrialing: boolean;
  /** Raw check function for ad-hoc product checks */
  check: ReturnType<typeof useCustomer>["check"];
  /** Force re-fetch entitlements from Recur API */
  refetch: () => Promise<void>;
}

const PRODUCT_SLUGS = ["team", "pro"] as const;

export function useEntitlement(): EntitlementInfo {
  const { check, isLoading, refetch } = useCustomer();

  if (isLoading) {
    return {
      isLoading: true,
      tier: "free",
      status: null,
      isPaid: false,
      isTrialing: false,
      check,
      refetch,
    };
  }

  // Check products in priority order (team > pro)
  for (const slug of PRODUCT_SLUGS) {
    const result = check(slug);
    if (result.allowed && result.entitlement) {
      const tier = slug as SubscriptionTier;
      const status = result.entitlement.status;
      return {
        isLoading: false,
        tier,
        status,
        isPaid: true,
        isTrialing: status === "trialing",
        check,
        refetch,
      };
    }
  }

  return {
    isLoading: false,
    tier: "free",
    status: null,
    isPaid: false,
    isTrialing: false,
    check,
    refetch,
  };
}
