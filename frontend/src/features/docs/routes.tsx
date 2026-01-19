import { Route } from "react-router-dom";
import DocumentationScreen from "./screens/DocumentationScreen";

/**
 * Documentation 路由（需在 DocsLayout 內使用，公開不需登入）
 */
export const docsRoutes = (
  <>
    <Route path="/docs" element={<DocumentationScreen />} />
    <Route path="/docs/:slug" element={<DocumentationScreen />} />
  </>
);
