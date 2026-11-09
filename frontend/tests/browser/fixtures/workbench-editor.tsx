import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import "@/styles/globals.scss";
import { ContentLanguageProvider, ToastProvider } from "@/shared/contexts";
import { ThemeProvider } from "@/shared/ui/theme/ThemeContext";
import ContestContext, { type ContestContextType } from "@/features/contest/contexts/ContestValueContext";
import type { ContestDetail } from "@/core/entities/contest.entity";
import WorkbenchEditScreen from "@/features/contest/screens/settings/workbench/edit/WorkbenchEditScreen";
import { WorkbenchRailHeader } from "@/features/contest/screens/settings/workbench/WorkbenchRailHeader";
import ContestWorkbenchScreen from "@/features/contest/screens/settings/ContestWorkbenchScreen";
import { AuthProvider } from "@/features/auth/contexts/AuthContext";
import { WorkspaceProvider } from "@/features/app/contexts/WorkspaceContext";

const coding = new URLSearchParams(location.search).has("coding");
const contest = { id: "fixtures", name: "合成考卷", status: "draft", contestType: coding ? "coding" : "paper_exam", questionEditLocked: false,
  problems: coding ? [{ id: "binding-1", problemId: "problem-1", title: "A + B", label: "A", order: 0, maxScore: 100 }] : [],
} as ContestDetail;
const context = { contest, refreshContest: async () => {} } as ContestContextType;
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <I18nextProvider i18n={i18n}>
    <QueryClientProvider client={client}>
      <ThemeProvider><ToastProvider><ContentLanguageProvider>
        <BrowserRouter><AuthProvider><WorkspaceProvider><ContestContext.Provider value={context}>
          <Routes><Route path="/tests/browser/:contestId/workbench-editor.html" element={
            <div style={{ height: "100dvh" }}>
              {coding ? <ContestWorkbenchScreen contestId={contest.id} contest={contest} /> : <WorkbenchEditScreen header={<WorkbenchRailHeader mode="edit" gradeDisabled onModeChange={() => {}}
                onExport={() => { document.getElementById("fixture-action")!.textContent = "匯出"; }}
                onPreview={() => { document.getElementById("fixture-action")!.textContent = "預覽"; }} />}
              />}
              <output id="fixture-action" aria-label="合成操作" style={{ position: "fixed", bottom: 0, right: 0 }} />
            </div>
          } /></Routes>
        </ContestContext.Provider></WorkspaceProvider></AuthProvider></BrowserRouter>
      </ContentLanguageProvider></ToastProvider></ThemeProvider>
    </QueryClientProvider>
  </I18nextProvider>,
);
