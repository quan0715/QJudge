import { Route } from "react-router-dom";
import ProblemListScreen from "./screens/problems";
import ProblemDetailScreen from "./screens/problemsId";
import ProblemSolveScreen from "./screens/problemsIdSolve";
import ProblemEditScreen from "./screens/problemsIdEdit";
import ProblemLayout from "./components/layout/ProblemLayout";

/**
 * Problem 路由（需在 RequireAuth + MainLayout 內使用）
 */
export const problemRoutes = (
  <>
    {/* 題目列表 */}
    <Route path="/problems" element={<ProblemListScreen />} />
  </>
);

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

/**
 * Problem Edit 路由（全螢幕編輯器，需在 RequireAuth 內使用）
 * 僅限 admin/teacher 存取
 * 
 * 新版：使用 Scroll-spy 導航 + Auto-save PATCH
 */
export const problemEditRoutes = (
  <Route path="/problems/:id/edit" element={<ProblemEditScreen />} />
);
