import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnvelopeError } from "@/infrastructure/api/envelope";
import { getUserSummary, searchUsers, updateUserRole } from "@/infrastructure/api/repositories/user.repository";
import { issueAdminPasswordReset, issueTeacherActivationActionLink } from "@/infrastructure/api/repositories/auth.repository";
import UserManagementScreen from "./UserManagementScreen";

const translate = (key: string, fallback?: unknown) => typeof fallback === "string" ? fallback : key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock("@/infrastructure/api/repositories/user.repository", () => ({ getUserSummary: vi.fn(), searchUsers: vi.fn(), updateUserRole: vi.fn() }));
vi.mock("@/infrastructure/api/repositories/auth.repository", () => ({ issueTeacherActivationActionLink: vi.fn(), issueAdminPasswordReset: vi.fn() }));
const student = { id: 1, username: "student-a", email: "student@example.test", role: "student" as const,
  auth_provider: "password", last_login_at: null, onboarding_completed_at: null,
  profile: { display_name: "Student", avatar_url: null } };
const denied = (message: string) => new EnvelopeError(403, [{ code: "permission_denied", message, field: null, details: {} }]);

beforeEach(() => {
  vi.mocked(getUserSummary).mockReset().mockResolvedValue({ total: 153, teachers: 21, pendingOnboarding: 41 });
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
    await userEvent.selectOptions(screen.getByRole("combobox"), "teacher");
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

describe("UserManagementScreen summary", () => {
  it("does not show a partial total when the summary fails", async () => {
    vi.mocked(getUserSummary).mockRejectedValueOnce(new Error("Unavailable"));
    render(<UserManagementScreen />);
    await screen.findByText("student-a");
    expect(await screen.findByText("無法讀取")).toBeTruthy();
    expect(screen.getByText("總使用者").nextElementSibling?.textContent).toBe("—");
  });

  it("refreshes the platform summary after changing a role", async () => {
    vi.mocked(updateUserRole).mockResolvedValueOnce({ data: { ...student, role: "teacher" }, meta: {} });
    render(<UserManagementScreen />);
    await screen.findByText("student-a");
    vi.mocked(getUserSummary).mockResolvedValueOnce({ total: 153, teachers: 22, pendingOnboarding: 41 });
    await userEvent.selectOptions(screen.getByRole("combobox"), "teacher");
    await userEvent.click(screen.getByRole("button", { name: "button.confirm" }));
    await waitFor(() => expect(screen.getByText("已開通教師").nextElementSibling?.textContent).toBe("22"));
    expect(getUserSummary).toHaveBeenCalledTimes(2);
  });

  it("shows global totals independent of the limited user list and search", async () => {
    const teacher = {
      ...student,
      id: 2,
      username: "teacher-a",
      role: "teacher" as const,
      onboarding_completed_at: "2026-09-01T00:00:00Z",
    };
    vi.mocked(searchUsers).mockResolvedValueOnce({ data: [student, teacher], meta: {} });

    render(<UserManagementScreen />);
    await screen.findByText("teacher-a");

    const valueOf = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    expect(valueOf("總使用者")).toBe("153");
    expect(valueOf("已開通教師")).toBe("21");
    expect(valueOf("未完成 onboarding")).toBe("41");
    vi.mocked(searchUsers).mockResolvedValueOnce({ data: [student], meta: {} });
    await userEvent.type(screen.getByLabelText("user.management.searchLabel"), "student");
    await userEvent.click(screen.getByRole("button", { name: "button.search" }));
    expect(valueOf("總使用者")).toBe("153");
  });
});

it("issues a reset link for the selected account without changing its role", async () => {
  vi.mocked(issueAdminPasswordReset).mockResolvedValue({ data: { reset_url: "https://example.test/reset-password#uid=MQ&token=test", expires_in: 3600 }, meta: {} });
  render(<UserManagementScreen />);
  await screen.findByText("student-a");
  expect(screen.queryByRole("button", { name: "直接開通教師" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "產生密碼重設連結" }));
  expect(issueAdminPasswordReset).toHaveBeenCalledWith(1);
  expect(await screen.findByDisplayValue("https://example.test/reset-password#uid=MQ&token=test")).toBeTruthy();
  expect(updateUserRole).not.toHaveBeenCalled();
});

it("does not offer password recovery for a Google account", async () => {
  vi.mocked(searchUsers).mockResolvedValueOnce({ data: [{ ...student, auth_provider: "google" }], meta: {} });
  render(<UserManagementScreen />);
  await screen.findByText("student-a");
  expect(screen.queryByRole("button", { name: "產生密碼重設連結" })).toBeNull();
  expect(screen.getByRole("combobox")).toBeTruthy();
});
