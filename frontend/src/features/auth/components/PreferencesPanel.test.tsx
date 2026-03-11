import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PreferencesPanel } from "./PreferencesPanel";

const updateDisplayNameMock = vi.fn();
const updateAccountProfileMock = vi.fn();
const requestPasswordResetMock = vi.fn();
const userState = {
  username: "tester",
  email: "tester@example.com",
  role: "student",
  auth_provider: "email",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
  }),
}));

vi.mock("@/features/auth/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: userState,
  }),
}));

vi.mock("@/features/auth/hooks/useUserPreferences", () => ({
  useUserPreferences: () => ({
    themePreference: "system",
    updateTheme: vi.fn().mockResolvedValue(undefined),
    language: "zh-TW",
    updateLanguage: vi.fn().mockResolvedValue(undefined),
    displayName: "Tester",
    updateDisplayName: updateDisplayNameMock,
    updateAccountProfile: updateAccountProfileMock,
    requestPasswordReset: requestPasswordResetMock,
  }),
}));

vi.mock("@/shared/ui/config/ThemeSwitch", () => ({
  ThemeSwitch: () => <div data-testid="theme-switch" />,
}));

vi.mock("@/shared/ui/config/LanguageSwitch", () => ({
  LanguageSwitch: () => <div data-testid="language-switch" />,
}));

describe("PreferencesPanel display name persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userState.auth_provider = "email";
  });

  it("updates saved-name reference only after successful debounce save", async () => {
    updateDisplayNameMock.mockResolvedValue(undefined);
    render(<PreferencesPanel />);

    const displayNameInput = screen.getByPlaceholderText("preferences.displayName");
    fireEvent.change(displayNameInput, { target: { value: "Tester 2" } });

    await waitFor(() => {
      expect(updateDisplayNameMock).toHaveBeenCalledWith("Tester 2");
    }, { timeout: 3000 });
    expect(screen.getByText("顯示名稱已更新")).toBeInTheDocument();
  });

  it("shows retry action when display-name save fails and allows retry", async () => {
    updateDisplayNameMock
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValueOnce(undefined);
    render(<PreferencesPanel />);

    const displayNameInput = screen.getByPlaceholderText("preferences.displayName");
    fireEvent.change(displayNameInput, { target: { value: "Retry Name" } });
    fireEvent.blur(displayNameInput);

    await waitFor(() => {
      expect(screen.getByTestId("display-name-retry-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("display-name-retry-btn"));

    await waitFor(() => {
      expect(updateDisplayNameMock).toHaveBeenCalledTimes(2);
    });
  });

  it("allows email users to edit username/email and save", async () => {
    updateAccountProfileMock.mockResolvedValue(undefined);
    render(<PreferencesPanel />);

    const usernameInput = screen.getByLabelText("preferences.username");
    const emailInput = screen.getByLabelText("preferences.email");
    fireEvent.change(usernameInput, { target: { value: "tester2" } });
    fireEvent.change(emailInput, { target: { value: "tester2@example.com" } });

    fireEvent.click(screen.getByTestId("account-profile-save-btn"));

    await waitFor(() => {
      expect(updateAccountProfileMock).toHaveBeenCalledWith({
        username: "tester2",
        email: "tester2@example.com",
      });
    });
  });

  it("disables account editing for oauth users", async () => {
    userState.auth_provider = "nycu-oauth";
    render(<PreferencesPanel />);

    const usernameInput = screen.getByLabelText("preferences.username");
    const emailInput = screen.getByLabelText("preferences.email");

    expect(usernameInput).toHaveAttribute("readonly");
    expect(emailInput).toHaveAttribute("readonly");
    expect(screen.queryByTestId("account-profile-save-btn")).not.toBeInTheDocument();
    expect(screen.getByTestId("forgot-password-request-btn")).toBeDisabled();
  });

  it("keeps forgot-password action disabled when email reset is not enabled", async () => {
    render(<PreferencesPanel />);

    const forgotPasswordButton = screen.getByTestId("forgot-password-request-btn");
    expect(forgotPasswordButton).toBeDisabled();
    fireEvent.click(forgotPasswordButton);
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });
});
