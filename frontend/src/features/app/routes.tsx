import { Route } from "react-router-dom";
import NotFoundScreen from "./screens/NotFoundScreen";
import ServerErrorScreen from "./screens/ServerErrorScreen";

/**
 * Error 路由（公開，不需登入）
 */
export const errorRoutes = (
  <>
    <Route path="/error" element={<ServerErrorScreen />} />
    <Route path="/not-found" element={<NotFoundScreen />} />
  </>
);

/**
 * 404 Fallback 路由（放在 Routes 最後）
 */
export const fallbackRoute = <Route path="*" element={<NotFoundScreen />} />;
