import { Route } from "react-router-dom";
import ProblemDetailScreen from "./screens/problemsId";
import ProblemSolveScreen from "./screens/problemsIdSolve";
import ProblemLayout from "./components/layout/ProblemLayout";

/**
 * Problem Detail 路由（獨立 Layout，需在 RequireAuth 內使用）
 */
export const problemDetailRoutes = (
  <Route path="/problems/:id" element={<ProblemLayout />}>
    <Route index element={<ProblemDetailScreen />} />
  </Route>
);

/**
 * Problem Solve 路由（全螢幕 IDE 風格，需在 RequireAuth 內使用）
 */
export const problemSolveRoutes = (
  <Route path="/problems/:id/solve" element={<ProblemSolveScreen />} />
);
