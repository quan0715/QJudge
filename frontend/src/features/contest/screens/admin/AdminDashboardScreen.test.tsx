import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import AdminDashboardScreen from "./AdminDashboardScreen";

const mockRefreshContest = vi.fn();
const mockRefreshAllAdminData = vi.fn();
const mockRefreshAdminData = vi.fn();
const mockRefreshParticipants = vi.fn();
const mockPanelMount = vi.fn();

const mockContest = {
  id: "contest-1",
  name: "Contest 1",
  contestType: "coding",
  status: "published",
  permissions: { canEditContest: true },
  currentUserRole: "co_owner",
  boundClassroomId: "classroom-1",
};
let mockContestState: { contest: typeof mockContest | null; loading: boolean } = {
  contest: mockContest,
  loading: false,
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
    ...mockContestState,
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
      // Like the real modules, a type-specific panel is only valid once the contest is known.
      getAvailablePanels: (contest: unknown) =>
        contest
          ? ["overview", "problem_editor", "participants", "logs", "grading"]
          : ["overview", "problem_editor"],
    },
  }),
}));

vi.mock("@/features/contest/modules/AdminPanelRendererRegistry", () => ({
  getAdminPanelRenderer: () => {
    const Renderer = (props: { panelId: string }) => {
      useEffect(() => {
        mockPanelMount();
      }, []);
      return <div data-testid="admin-panel-slot">{props.panelId}</div>;
    };
    return Renderer;
  },
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
  ContestSettingsOverlay: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    <button data-testid="settings-overlay" type="button" onClick={onClose}>
      {open ? "open" : "closed"}
    </button>
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
    mockPanelMount.mockReset();
    mockContestState = { contest: mockContest, loading: false };
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

  it("does not remount the active panel when the dashboard rerenders", () => {
    const renderRoute = () => (
      <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1/admin?panel=problem_editor"]}>
        <Routes>
          <Route path="/classrooms/:classroomId/contest/:contestId/admin" element={<AdminDashboardScreen />} />
        </Routes>
      </MemoryRouter>
    );
    const view = render(renderRoute());

    expect(mockPanelMount).toHaveBeenCalledTimes(1);
    view.rerender(renderRoute());

    expect(mockPanelMount).toHaveBeenCalledTimes(1);
  });

  it("keeps ?panel=settings as the overlay source until the overlay closes", async () => {
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

    expect(screen.getByTestId("location-search")).toHaveTextContent("panel=settings");
    fireEvent.click(screen.getByTestId("settings-overlay"));

    await waitFor(() => {
      expect(screen.getByTestId("location-search").textContent ?? "").not.toContain("panel=settings");
    });
  });

  it("keeps a type-specific ?panel deep link while the contest is still loading", async () => {
    mockContestState = { contest: null, loading: true };
    const renderRoute = () => (
      <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1/admin?panel=grading"]}>
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
      </MemoryRouter>
    );
    const view = render(renderRoute());
    expect(mockPanelMount).not.toHaveBeenCalled();

    mockContestState = { contest: mockContest, loading: false };
    view.rerender(renderRoute());

    await waitFor(() => {
      expect(mockPanelMount).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("location-search")).toHaveTextContent("panel=grading");
  });
});
