import { type RouteConfig, index, route } from "@react-router/dev/routes";
import config from "../docs.config";
export default [
  index("routes/home.tsx"),
  route(
    ":locale" + ("basePath" in config ? config.basePath : "/docs") + "/*",
    "routes/article.tsx",
  ),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
