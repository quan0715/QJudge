import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { HelmetProvider } from "react-helmet-async";
import i18n from "@/i18n";
import ErrorBoundary from "@/features/app/components/ErrorBoundary";
import LandingScreen from "@/features/landing/screens/LandingScreen";
import { ContentLanguageProvider } from "@/shared/contexts/ContentLanguageContext";
import { ThemeProvider } from "@/shared/ui/theme/ThemeContext";

import "./styles/globals.scss";
import "./styles/fonts.css";

function LandingApp() {
  return (
    <HelmetProvider>
      <ErrorBoundary>
        <I18nextProvider i18n={i18n}>
          <ContentLanguageProvider>
            <ThemeProvider>
              <BrowserRouter>
                <LandingScreen />
              </BrowserRouter>
            </ThemeProvider>
          </ContentLanguageProvider>
        </I18nextProvider>
      </ErrorBoundary>
    </HelmetProvider>
  );
}

createRoot(document.getElementById("root")!).render(<LandingApp />);
