import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { UserMenu } from "./UserMenu";

vi.mock("@/features/auth/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, username: "student", email: "student@example.com", role: "student" },
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
});
