import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AdminDashboardLayout from "./AdminDashboardLayout";

vi.mock("@/features/app/components/UserMenu", () => ({
  UserMenu: () => <div data-testid="user-menu-mock" />,
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));

const baseProps = {
  contestId: "c1",
  contestName: "Contest A",
  activePanel: "overview" as const,
  availablePanels: ["overview", "settings"] as const,
  onPanelChange: vi.fn(),
};

describe("AdminDashboardLayout", () => {
  it("renders basic layout structure", () => {
    render(
      <MemoryRouter>
        <AdminDashboardLayout {...baseProps}>
          <div data-testid="child-content">content</div>
        </AdminDashboardLayout>
      </MemoryRouter>,
    );

    expect(screen.getByText("Contest A")).toBeInTheDocument();
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByTestId("user-menu-mock")).toBeInTheDocument();
  });

  it("renders refresh action when onRefresh is provided", () => {
    const onRefresh = vi.fn();

    render(
      <MemoryRouter>
        <AdminDashboardLayout {...baseProps} onRefresh={onRefresh}>
          <div>content</div>
        </AdminDashboardLayout>
      </MemoryRouter>,
    );

    const refreshAction = screen.getByLabelText("adminLayout.header.refresh");
    fireEvent.click(refreshAction);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders settings action when onSettingsOpen is provided", () => {
    const onSettingsOpen = vi.fn();

    render(
      <MemoryRouter>
        <AdminDashboardLayout {...baseProps} onSettingsOpen={onSettingsOpen}>
          <div>content</div>
        </AdminDashboardLayout>
      </MemoryRouter>,
    );

    const settingsAction = screen.getByLabelText("adminLayout.nav.settings");
    fireEvent.click(settingsAction);
    expect(onSettingsOpen).toHaveBeenCalledTimes(1);
  });
});
