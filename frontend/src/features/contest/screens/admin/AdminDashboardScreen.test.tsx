import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import AdminDashboardScreen from "./AdminDashboardScreen";

const mockRefreshContest = vi.fn();
const mockRefreshAllAdminData = vi.fn();
const mockRefreshAdminData = vi.fn();
const mockRefreshParticipants = vi.fn();

const mockContest = {
  id: "contest-1",
  name: "Contest 1",
  contestType: "coding",
  status: "published",
  permissions: { canEditContest: true },
  currentUserRole: "teacher",
  boundClassroomId: "classroom-1",
};

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

vi.mock("@/features/contest/contexts", () => ({
  ContestProvider: ({ children }: { children: ReactNode }) => children,
  ContestAdminProvider: ({ children }: { children: ReactNode }) => children,
  AdminPanelRefreshProvider: ({ children }: { children: ReactNode }) => children,
  useContest: () => ({
    contest: mockContest,
    loading: false,
    refreshContest: mockRefreshContest,
  }),
  useContestAdmin: () => ({
    refreshAllAdminData: mockRefreshAllAdminData,
    refreshAdminData: mockRefreshAdminData,
    refreshParticipants: mockRefreshParticipants,
  }),
  useAdminPanelRefresh: () => ({
    triggerPanelRefresh: vi.fn(),
  }),
}));

vi.mock("@/features/contest/modules/registry", () => ({
  getContestTypeModule: () => ({
    admin: {
      editorKind: "coding",
      getAvailablePanels: () => ["overview", "problem_editor", "participants", "logs"],
    },
  }),
}));

vi.mock("@/features/contest/modules/AdminPanelRendererRegistry", () => ({
  getAdminPanelRenderer: () => (props: { panelId: string }) => (
    <div data-testid="admin-panel-slot">{props.panelId}</div>
  ),
}));

vi.mock("@/features/app/components/WorkspaceToolBar", () => ({
  WorkspaceToolBar: ({
    title,
    actions,
  }: {
    title: ReactNode;
    actions?: ReactNode;
  }) => (
    <div>
      <div data-testid="toolbar-title">{title}</div>
      <div data-testid="toolbar-actions">{actions}</div>
    </div>
  ),
}));

vi.mock("@/features/contest/components/admin/ContestExportDialog", () => ({
  default: () => null,
}));

vi.mock("@/features/contest/screens/admin/panels/AdminContestSettingsScreen", () => ({
  ContestSettingsOverlay: ({ open }: { open: boolean }) => (
    <div data-testid="settings-overlay">{open ? "open" : "closed"}</div>
  ),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

describe("AdminDashboardScreen", () => {
  beforeEach(() => {
    mockRefreshContest.mockReset();
    mockRefreshAllAdminData.mockReset();
    mockRefreshAdminData.mockReset();
  });

  it("does not render the legacy workspace toolbar", () => {
    render(
      <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1/admin?panel=overview"]}>
        <Routes>
          <Route path="/classrooms/:classroomId/contest/:contestId/admin" element={<AdminDashboardScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("toolbar-actions")).not.toBeInTheDocument();
  });

  it("maps ?panel=settings to open overlay and rewrites panel query to overview", async () => {
    render(
      <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1/admin?panel=settings"]}>
        <Routes>
          <Route
            path="/classrooms/:classroomId/contest/:contestId/admin"
            element={(
              <>
                <AdminDashboardScreen />
                <LocationProbe />
              </>
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("settings-overlay")).toHaveTextContent("open");
    });

    await waitFor(() => {
      expect(screen.getByTestId("location-search").textContent ?? "").not.toContain("panel=settings");
    });
  });
});
