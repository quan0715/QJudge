export {
  DEFAULT_DOC_ICON_REGISTRY,
  DocsFrameworkProvider,
  useDocsFramework,
  type DocsBrandConfig,
  type DocsFrameworkConfig,
  type DocsFrameworkProviderProps,
  type ResolvedDocsFrameworkConfig,
} from "./contexts/DocsFrameworkContext";

export {
  createStaticDocSource,
  type StaticDocSourceOptions,
} from "./source/staticDocSource";

export {
  createDocsI18n,
  DEFAULT_DOCS_RESOURCES,
  type CreateDocsI18nOptions,
} from "./i18n/createDocsI18n";

export { useDocsSearch } from "./hooks/useDocsSearch";

export {
  DocsErrorBoundary,
  type DocsErrorBoundaryProps,
} from "./components/DocsErrorBoundary";
export { default as DocsShell } from "./components/DocsShell";
export { default as DocsHeader } from "./components/DocsHeader";
export {
  default as DocSidebar,
  type DocSidebarProps,
} from "./components/DocSidebar";
export {
  default as DocTableOfContents,
  type DocTableOfContentsProps,
} from "./components/DocTableOfContents";
export { default as DocsSearchDropdown } from "./components/DocsSearchDropdown";
export {
  default as DocFeedback,
  type DocFeedbackProps,
} from "./components/DocFeedback";
export {
  default as QuickLinkCards,
  type QuickLinkCardsProps,
} from "./components/QuickLinkCards";

export { default as DocumentationScreen } from "./screens/DocumentationScreen";
