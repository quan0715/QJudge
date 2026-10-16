import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserMenu } from "./UserMenu";

const signedIn = vi.hoisted(() => ({ role: "student" }));

vi.mock("@/features/auth/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, username: "someone", email: "someone@example.com", role: signedIn.role },
    logout: vi.fn(),
  }),
}));

vi.mock("@/features/auth/contexts/SettingsDialogContext", () => ({
  useSettingsDialog: () => ({ open: vi.fn() }),
}));

vi.mock("@/features/auth/hooks/useUserPreferences", () => ({
  useUserPreferences: () => ({ displayName: "Student", avatarUrl: "" }),
}));

vi.mock("@/features/contest/hooks", () => ({
  useContestRuntimeMode: () => ({ isRuntime: false }),
}));

describe("UserMenu", () => {
  beforeEach(() => {
    signedIn.role = "student";
  });

  it("opens the documentation from the user menu", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<UserMenu />} />
          <Route path="/docs" element={<p>docs page</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("user-menu-toggle-btn"));
    fireEvent.click(screen.getByTestId("user-menu-docs-btn"));

    expect(screen.getByText("docs page")).toBeInTheDocument();
  });

  it("shows one system admin entry for admins and sends them to /system", () => {
    signedIn.role = "admin";
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<UserMenu />} />
          <Route path="/system" element={<p>system page</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("user-menu-toggle-btn"));

    expect(screen.getAllByRole("button", { name: "系統管理" })).toHaveLength(1);
    expect(screen.queryByText("用戶管理")).toBeNull();
    expect(screen.queryByText("服務狀態")).toBeNull();

    fireEvent.click(screen.getByTestId("user-menu-system-btn"));

    expect(screen.getByText("system page")).toBeInTheDocument();
  });

  it("hides the system admin entry from non-admins", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<UserMenu />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("user-menu-toggle-btn"));

    expect(screen.queryByTestId("user-menu-system-btn")).toBeNull();
    expect(screen.queryByText("系統管理")).toBeNull();
  });
});
