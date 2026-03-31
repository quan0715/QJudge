import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AdminDashboardLayout from "./AdminDashboardLayout";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));

const baseProps = {
  contestName: "Contest A",
  activePanel: "problem_editor" as const,
  availablePanels: [
    "overview",
    "clarifications",
    "logs",
    "participants",
    "problem_editor",
    "grading",
    "statistics",
    "settings",
  ] as const,
  onPanelChange: vi.fn(),
  onBack: vi.fn(),
  onExport: vi.fn(),
};

describe("AdminDashboardLayout", () => {
  it("shows import action only when exam json actions are enabled", () => {
    const onImportExamJson = vi.fn();

    render(
      <MemoryRouter>
        <AdminDashboardLayout
          {...baseProps}
          showExamJsonActions
          onImportExamJson={onImportExamJson}
        >
          <div>content</div>
        </AdminDashboardLayout>
      </MemoryRouter>,
    );

    const importAction = screen.getByLabelText(/匯入 JSON|Import JSON|examJson\.importAction/);
    expect(importAction).toBeInTheDocument();

    fireEvent.click(importAction);
    expect(onImportExamJson).toHaveBeenCalledTimes(1);
  });

  it("hides import action when exam json actions are disabled", () => {
    render(
      <MemoryRouter>
        <AdminDashboardLayout {...baseProps} showExamJsonActions={false}>
          <div>content</div>
        </AdminDashboardLayout>
      </MemoryRouter>,
    );

    expect(
      screen.queryByLabelText(/匯入 JSON|Import JSON|examJson\.importAction/),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("adminLayout.header.exportFiles")).toBeInTheDocument();
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
});
