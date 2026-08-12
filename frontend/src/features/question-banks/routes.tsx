import { lazy } from "react";
import { Route } from "react-router-dom";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";

const QuestionBankDetailScreen = lazy(() => import("./screens/QuestionBankDetailScreen"));

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
