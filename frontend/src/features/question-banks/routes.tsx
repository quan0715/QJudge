import { lazy } from "react";
import { Route } from "react-router-dom";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";

const QuestionBankDetailScreen = lazy(() => import("./screens/QuestionBankDetailScreen"));
const QuestionBankMarketplaceScreen = lazy(() => import("./screens/QuestionBankMarketplaceScreen"));
const MarketplaceBankPreviewScreen = lazy(() => import("./screens/MarketplaceBankPreviewScreen"));

export const questionBankMarketplaceRoute = (
  <>
    <Route
      path="/marketplace"
      element={
        <RouteLoadingBoundary>
          <QuestionBankMarketplaceScreen />
        </RouteLoadingBoundary>
      }
    />
    <Route
      path="/marketplace/:bankId"
      element={
        <RouteLoadingBoundary>
          <MarketplaceBankPreviewScreen />
        </RouteLoadingBoundary>
      }
    />
  </>
);

export const questionBankDetailRoute = (
  <Route
    path="/question-banks/:bankId"
    element={
      <RouteLoadingBoundary>
        <QuestionBankDetailScreen />
      </RouteLoadingBoundary>
    }
  />
);
