import { createContext, useContext, useMemo, type ElementType, type ReactNode } from "react";
import {
  BareMetalServer,
  Code,
  Document,
  DocumentBlank,
  Rocket,
  Settings,
  UserAdmin,
  UserMultiple,
} from "@carbon/icons-react";
import type { DocContentSourcePort } from "@/core/docs";
import { SUPPORTED_LANGUAGES, type SupportedLanguageOption } from "@/i18n/languages";
import { createStaticDocSource } from "../source/staticDocSource";

export interface DocsBrandConfig {
  title: string;
  headerBrand?: ReactNode;
  sidebarBrand?: ReactNode;
  productLabelKey?: string;
  homeHref?: string;
}

export interface DocsFrameworkConfig {
  brand: DocsBrandConfig;
  routeBase?: string;
  fallbackLanguage?: string;
  languages?: ReadonlyArray<SupportedLanguageOption>;
  sectionIcons?: Record<string, ElementType>;
  quickLinkIcons?: Record<string, ElementType>;
  source?: DocContentSourcePort;
  onFeedback?: (docSlug: string, type: "helpful" | "not-helpful") => void;
}

export interface ResolvedDocsFrameworkConfig {
  brand: DocsBrandConfig;
  routeBase: string;
  fallbackLanguage: string;
  languages: ReadonlyArray<SupportedLanguageOption>;
  sectionIcons: Record<string, ElementType>;
  quickLinkIcons: Record<string, ElementType>;
  source: DocContentSourcePort;
  onFeedback?: (docSlug: string, type: "helpful" | "not-helpful") => void;
}

export const DEFAULT_DOC_ICON_REGISTRY: Record<string, ElementType> = {
  rocket: Rocket,
  server: BareMetalServer,
  document: Document,
  "document-blank": DocumentBlank,
  admin: UserAdmin,
  code: Code,
  settings: Settings,
  users: UserMultiple,
};

const defaultStaticSource = createStaticDocSource();

const DEFAULT_FRAMEWORK_CONFIG: ResolvedDocsFrameworkConfig = {
  brand: {
    title: "Docs",
    homeHref: "/docs",
  },
  routeBase: "/docs",
  fallbackLanguage: "zh-TW",
  languages: SUPPORTED_LANGUAGES,
  sectionIcons: DEFAULT_DOC_ICON_REGISTRY,
  quickLinkIcons: DEFAULT_DOC_ICON_REGISTRY,
  source: defaultStaticSource,
};

const DocsFrameworkContext = createContext<ResolvedDocsFrameworkConfig>(
  DEFAULT_FRAMEWORK_CONFIG,
);

export interface DocsFrameworkProviderProps {
  config: DocsFrameworkConfig;
  children: ReactNode;
}

export const DocsFrameworkProvider: React.FC<DocsFrameworkProviderProps> = ({
  config,
  children,
}) => {
  const value = useMemo<ResolvedDocsFrameworkConfig>(() => {
    const routeBase = (config.routeBase || "/docs").replace(/\/$/, "") || "/docs";
    const fallbackLanguage = config.fallbackLanguage || "zh-TW";
    const source =
      config.source ??
      createStaticDocSource({
        fallbackLanguage,
      });

    return {
      brand: {
        ...config.brand,
        homeHref: config.brand.homeHref ?? routeBase,
      },
      routeBase,
      fallbackLanguage,
      languages: config.languages ?? SUPPORTED_LANGUAGES,
      sectionIcons: {
        ...DEFAULT_DOC_ICON_REGISTRY,
        ...config.sectionIcons,
      },
      quickLinkIcons: {
        ...DEFAULT_DOC_ICON_REGISTRY,
        ...config.quickLinkIcons,
      },
      source,
      onFeedback: config.onFeedback,
    };
  }, [config]);

  return (
    <DocsFrameworkContext.Provider value={value}>
      {children}
    </DocsFrameworkContext.Provider>
  );
};

export function useDocsFramework(): ResolvedDocsFrameworkConfig {
  return useContext(DocsFrameworkContext);
}
