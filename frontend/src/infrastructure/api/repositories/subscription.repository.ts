import { httpClient, requestJson } from "@/infrastructure/api/http.client";

const API_BASE = "/api/v1/subscriptions";

export interface SubscriptionData {
  tier: "free" | "pro" | "team" | "enterprise";
  status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
  recur_subscription_id: string;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancelled_at: string | null;
  created_at: string;
}

interface SubscriptionResponse {
  success: boolean;
  data: SubscriptionData;
}

interface CheckoutConfigResponse {
  success: boolean;
  data: {
    publishable_key: string;
    product_id: string;
    customer_email: string;
  };
}

export const getCurrentSubscription = async (): Promise<SubscriptionResponse> =>
  requestJson(httpClient.get(`${API_BASE}/me/`));

export const getCheckoutConfig = async (
  productSlug: "pro" | "team"
): Promise<CheckoutConfigResponse> =>
  requestJson(
    httpClient.post(`${API_BASE}/checkout/`, { product_slug: productSlug })
  );

interface PortalSessionResponse {
  success: boolean;
  data: { url: string };
}

export const createPortalSession =
  async (): Promise<PortalSessionResponse> =>
    requestJson(httpClient.post(`${API_BASE}/portal/`));
