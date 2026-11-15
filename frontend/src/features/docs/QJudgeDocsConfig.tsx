import { BrandLockup } from "@/shared/brand/BrandLockup";
import type { DocsFrameworkConfig } from "@/shared/docs";

const mainAppUrl = import.meta.env.VITE_MAIN_APP_URL || "/";

export const qjudgeDocsConfig: DocsFrameworkConfig = {
  brand: {
    title: "QJudge Docs",
    headerBrand: <BrandLockup label="QJudge Docs" size={20} />,
    sidebarBrand: <BrandLockup size={22} />,
    homeHref: mainAppUrl,
  },
  routeBase: "/docs",
  fallbackLanguage: "zh-TW",
};
