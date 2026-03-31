import { Route } from "react-router";
import CheckoutSuccessScreen from "./screens/CheckoutSuccessScreen";

export const checkoutSuccessRoute = (
  <Route path="/checkout/success" element={<CheckoutSuccessScreen />} />
);
