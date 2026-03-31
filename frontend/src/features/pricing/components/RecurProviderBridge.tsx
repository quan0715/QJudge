/**
 * Bridge between AuthProvider and RecurProvider.
 *
 * RecurProvider is used solely for entitlements (useCustomer).
 * Checkout uses the vanilla SDK's redirectToCheckout directly.
 */

import { type ReactNode, useMemo } from "react";
import { RecurProvider } from "recur-tw";
import { useAuth } from "@/features/auth/contexts/AuthContext";

const RECUR_PUBLISHABLE_KEY = import.meta.env.VITE_RECUR_PUBLISHABLE_KEY || "";

export default function RecurProviderBridge({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();

  const customer = useMemo(
    () => (user?.email ? { email: user.email } : undefined),
    [user?.email]
  );

  if (!RECUR_PUBLISHABLE_KEY) {
    return <>{children}</>;
  }

  return (
    <RecurProvider
      config={{ publishableKey: RECUR_PUBLISHABLE_KEY }}
      customer={customer}
    >
      {children}
    </RecurProvider>
  );
}
