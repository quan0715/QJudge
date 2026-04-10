import { Route } from "react-router";
import CheckoutSuccessScreen from "./screens/CheckoutSuccessScreen";
import PricingScreen from "./screens/PricingScreen";

export const pricingRoute = (
  <Route path="/pricing" element={<PricingScreen />} />
);

export const checkoutSuccessRoute = (
  <Route path="/checkout/success" element={<CheckoutSuccessScreen />} />
);
