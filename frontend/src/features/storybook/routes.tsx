import { Suspense, lazy } from "react";
import { Route } from "react-router-dom";
import { Loading } from "@carbon/react";

// Lazy load StorybookScreen for code splitting
const StorybookScreen = lazy(() => import("./screens/StorybookScreen"));

/**
 * Storybook 路由（Dev Only，在 App.tsx 中需用 import.meta.env.DEV 判斷）
 */
export const storybookRoute = (
  <Route
    path="/dev/storybook/*"
    element={
      <Suspense fallback={<Loading withOverlay />}>
        <StorybookScreen />
      </Suspense>
    }
  />
);
