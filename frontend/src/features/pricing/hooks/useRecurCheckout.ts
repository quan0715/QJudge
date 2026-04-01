import { useState, useEffect, useRef, useCallback } from "react";

interface RecurInstance {
  redirectToCheckout: (options: {
    productId: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
  }) => Promise<void>;
}

declare global {
  interface Window {
    RecurCheckout?: {
      init: (config: { publishableKey: string }) => RecurInstance;
    };
  }
}

const RECUR_CDN = "https://unpkg.com/recur-tw@latest/dist/recur.umd.js";

export function useRecurCheckout() {
  const [sdkReady, setSdkReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const instanceRef = useRef<RecurInstance | null>(null);

  useEffect(() => {
    if (window.RecurCheckout) {
      setSdkReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = RECUR_CDN;
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => setError("Failed to load payment SDK");
    document.head.appendChild(script);
  }, []);

  const checkout = useCallback(
    async (
      publishableKey: string,
      productId: string,
      customerEmail: string
    ) => {
      if (!window.RecurCheckout) {
        setError("Payment SDK not loaded");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        if (!instanceRef.current) {
          instanceRef.current = window.RecurCheckout.init({ publishableKey });
        }
        await instanceRef.current.redirectToCheckout({
          productId,
          customerEmail,
          successUrl: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/settings`,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Checkout failed");
        setLoading(false);
      }
    },
    []
  );

  return { sdkReady, loading, error, checkout };
}
