/**
 * Bridge between AuthProvider and RecurProvider.
 *
 * RecurProvider is used solely for entitlements (useCustomer).
 * Checkout uses the vanilla SDK's redirectToCheckout directly.
 */

import { type ReactNode, useEffect, useMemo } from "react";
import { RecurProvider } from "recur-tw";
import { useAuth } from "@/features/auth/contexts/AuthContext";

const RECUR_PUBLISHABLE_KEY = import.meta.env.VITE_RECUR_PUBLISHABLE_KEY || "";

function isBenignRecurCancel(reason: unknown, sourceHint = ""): boolean {
  const message = typeof reason === "string"
    ? reason
    : reason && typeof reason === "object" && "message" in reason && typeof (reason as { message?: unknown }).message === "string"
      ? (reason as { message: string }).message
      : "";
  const stack = reason && typeof reason === "object" && "stack" in reason && typeof (reason as { stack?: unknown }).stack === "string"
    ? (reason as { stack: string }).stack
    : "";
  const signal = `${message} ${stack} ${sourceHint}`.toLowerCase();
  const isCanceled = signal.includes("canceled");
  const isRecurEditor = signal.includes("editor.api-") || signal.includes("recur");
  return isCanceled && isRecurEditor;
}

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

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isBenignRecurCancel(event.reason)) {
        event.preventDefault();
      }
    };
    const onWindowError = (event: ErrorEvent) => {
      if (isBenignRecurCancel(event.error ?? event.message, event.filename || "")) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onWindowError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onWindowError);
    };
  }, []);

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
