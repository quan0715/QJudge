import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnvelopeError } from "@/infrastructure/api/envelope";
import { searchUsers, updateUserRole } from "@/infrastructure/api/repositories/user.repository";
import { issueTeacherActivationActionLink } from "@/infrastructure/api/repositories/auth.repository";
import UserManagementScreen from "./UserManagementScreen";

const translate = (key: string, fallback?: unknown) => typeof fallback === "string" ? fallback : key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock("@/infrastructure/api/repositories/user.repository", () => ({ searchUsers: vi.fn(), updateUserRole: vi.fn() }));
vi.mock("@/infrastructure/api/repositories/auth.repository", () => ({ issueTeacherActivationActionLink: vi.fn() }));
const student = { id: 1, username: "student-a", email: "student@example.test", role: "student" as const,
  auth_provider: "password", last_login_at: null, onboarding_completed_at: null,
  profile: { display_name: "Student", avatar_url: null } };
const denied = (message: string) => new EnvelopeError(403, [{ code: "permission_denied", message, field: null, details: {} }]);

beforeEach(() => {
  vi.mocked(searchUsers).mockReset().mockResolvedValue({ data: [student], meta: {} });
  vi.mocked(updateUserRole).mockReset();
  vi.mocked(issueTeacherActivationActionLink).mockReset();
});

describe("UserManagementScreen canonical errors", () => {
  it("shows the server message when loading users is rejected", async () => {
    vi.mocked(searchUsers).mockRejectedValueOnce(denied("Only administrators may view users"));
    render(<UserManagementScreen />);
    expect(await screen.findByText("Only administrators may view users")).toBeTruthy();
    expect(searchUsers).toHaveBeenCalledOnce();
  });

  it("shows the server message when searching users is rejected", async () => {
    render(<UserManagementScreen />);
    await screen.findByText("student-a");
    vi.mocked(searchUsers).mockRejectedValueOnce(denied("Search access was revoked"));
    await userEvent.type(screen.getByLabelText("user.management.searchLabel"), "student");
    await userEvent.click(screen.getByRole("button", { name: "button.search" }));
    expect(await screen.findByText("Search access was revoked")).toBeTruthy();
    expect(searchUsers).toHaveBeenLastCalledWith("student");
  });

  it("shows the server message after an actual role-change confirmation", async () => {
    vi.mocked(updateUserRole).mockRejectedValueOnce(denied("You cannot change this account's role"));
    render(<UserManagementScreen />);
    await screen.findByText("student-a");
    await userEvent.click(screen.getByRole("button", { name: "直接開通教師" }));
    await userEvent.click(screen.getByRole("button", { name: "button.confirm" }));
    expect(await screen.findByText("You cannot change this account's role")).toBeTruthy();
    expect(updateUserRole).toHaveBeenCalledWith(1, "teacher");
  });

  it("retains the load fallback for a transport failure", async () => {
    vi.mocked(searchUsers).mockRejectedValueOnce(new Error("Network unavailable"));
    render(<UserManagementScreen />);
    await waitFor(() => expect(screen.getByText("user.management.loadFailed")).toBeTruthy());
  });
});
