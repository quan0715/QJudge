import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { logout } from "@/infrastructure/api/repositories/auth.repository";
import { getCurrentUser } from "@/infrastructure/api/repositories/user.repository";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("@/infrastructure/api/repositories/auth.repository", () => ({
  logout: vi.fn(),
}));

vi.mock("@/infrastructure/api/repositories/user.repository", () => ({
  getCurrentUser: vi.fn(),
}));

const AuthProbe = () => {
  const { loading, user, logout: signOut } = useAuth();
  return (
    <div>
      <span data-testid="auth-state">
        {loading ? "loading" : user?.username ?? "anonymous"}
      </span>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
};

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates identity from the cookie-backed current-user endpoint", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      success: true,
      data: { id: 7, username: "alice", role: "student" },
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("alice");
    });
    expect(localStorage.getItem).not.toHaveBeenCalledWith("user");
  });

  it("settles as anonymous when no authenticated cookie session exists", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(
      Object.assign(new Error("Not authenticated"), { status: 401 }),
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("anonymous");
    });
    expect(localStorage.getItem).not.toHaveBeenCalledWith("user");
  });

  it("removes legacy identity data when signing out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      success: true,
      data: { id: 7, username: "alice", role: "student" },
    });
    vi.mocked(logout).mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await screen.findByText("alice");
    screen.getByRole("button", { name: "Sign out" }).click();

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("anonymous");
    });
    expect(localStorage.removeItem).toHaveBeenCalledWith("user");
  });
});
