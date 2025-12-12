/**
 * Standalone entry point for Documentation (GitHub Pages deployment)
 *
 * This is a minimal entry point that only includes documentation-related
 * components and dependencies. It uses HashRouter for GitHub Pages compatibility.
 */

import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import DocsLayout from "@/domains/docs/components/DocsLayout";
import DocumentationPage from "@/domains/docs/pages/DocumentationPage";
import ErrorBoundary from "@/ui/components/ErrorBoundary";
import { ThemeProvider } from "@/ui/theme/ThemeContext";
import { ContentLanguageProvider } from "@/contexts/ContentLanguageContext";

// Import styles
import "./styles/global.scss";
import "github-markdown-css/github-markdown-light.css";

function DocsApp() {
  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <ContentLanguageProvider>
          <ThemeProvider>
            <HashRouter>
              <Routes>
                <Route element={<DocsLayout />}>
                  {/* Root redirects directly to overview */}
                  <Route index element={<Navigate to="/docs/overview" replace />} />
                  {/* /docs also redirects to overview */}
                  <Route path="/docs" element={<Navigate to="/docs/overview" replace />} />
                  <Route path="/docs/:slug" element={<DocumentationPage />} />
                </Route>
                {/* Fallback - redirect to docs overview */}
                <Route path="*" element={<Navigate to="/docs/overview" replace />} />
              </Routes>
            </HashRouter>
          </ThemeProvider>
        </ContentLanguageProvider>
      </I18nextProvider>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById("root")!).render(<DocsApp />);
