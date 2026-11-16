import { type RouteConfig, index, route } from "@react-router/dev/routes";
import { source } from "./source.server";

export default [
  index("routes/home.tsx"),
  route(":locale" + source.config.basePath + "/*", "routes/article.tsx"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
