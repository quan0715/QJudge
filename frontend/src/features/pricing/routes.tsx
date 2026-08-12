import { lazy } from "react";
import { Route } from "react-router";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";

const CheckoutSuccessScreen = lazy(() => import("./screens/CheckoutSuccessScreen"));
const PricingScreen = lazy(() => import("./screens/PricingScreen"));

export const pricingRoute = (
  <Route
    path="/pricing"
    element={
      <RouteLoadingBoundary>
        <PricingScreen />
      </RouteLoadingBoundary>
    }
  />
);

export const checkoutSuccessRoute = (
  <Route
    path="/checkout/success"
    element={
      <RouteLoadingBoundary>
        <CheckoutSuccessScreen />
      </RouteLoadingBoundary>
    }
  />
);
