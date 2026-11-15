/**
 * Standalone entry point for Documentation (Cloudflare Pages / static hosting)
 *
 * Uses isolated docs i18n, isolated error boundary, and HashRouter so the
 * documentation bundle stays decoupled from main product features and locales.
 */

import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import {
  createDocsI18n,
  DocsErrorBoundary,
  DocumentationScreen,
} from "@/shared/docs";
import DocsLayout from "@/features/docs/components/DocsLayout";
import { ThemeProvider } from "@/shared/ui/theme/ThemeContext";

import "./styles/globals.scss";

const docsI18n = createDocsI18n();

function DocsApp() {
  return (
    <DocsErrorBoundary homeHref={import.meta.env.VITE_MAIN_APP_URL || "/"}>
      <I18nextProvider i18n={docsI18n}>
        <ThemeProvider>
          <HashRouter>
            <Routes>
              <Route element={<DocsLayout />}>
                <Route
                  index
                  element={<Navigate to="/docs/overview" replace />}
                />
                <Route
                  path="/docs"
                  element={<Navigate to="/docs/overview" replace />}
                />
                <Route path="/docs/:slug" element={<DocumentationScreen />} />
              </Route>
              <Route
                path="*"
                element={<Navigate to="/docs/overview" replace />}
              />
            </Routes>
          </HashRouter>
        </ThemeProvider>
      </I18nextProvider>
    </DocsErrorBoundary>
  );
}

createRoot(document.getElementById("root")!).render(<DocsApp />);
