import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import OnboardingScreen from "./OnboardingScreen";

vi.mock("@/features/auth/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    user: {
      id: 1,
      username: "testuser",
      email: "test@test.com",
      role: "student",
      profile: { display_name: "", preferred_language: "zh-TW", preferred_theme: "system" },
    },
    setUser: vi.fn(),
    loading: false,
    checkUser: vi.fn(),
    logout: vi.fn(),
  })),
}));

vi.mock("@/features/auth/contexts/AuthLayoutContext", () => ({
  useAuthLayoutMetadata: vi.fn(),
}));

vi.mock("@/shared/ui/theme/ThemeContext", () => ({
  useTheme: vi.fn(() => ({
    theme: "g100",
    preference: "system",
    setPreference: vi.fn(),
  })),
}));

vi.mock("@/shared/contexts/ContentLanguageContext", () => ({
  useContentLanguage: vi.fn(() => ({
    contentLanguage: "zh-TW",
    setContentLanguage: vi.fn(),
  })),
}));

const mockUpdatePreferences = vi.fn();
vi.mock("@/infrastructure/api/repositories/auth.repository", () => ({
  updatePreferences: (...args: any[]) => mockUpdatePreferences(...args),
}));

vi.mock("@/features/auth/utils/onboarding", () => ({
  getAuthedLandingPath: vi.fn(() => "/dashboard"),
}));

import { useAuth } from "@/features/auth/contexts/AuthContext";

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <OnboardingScreen />
    </MemoryRouter>
  );
}

describe("OnboardingScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should send onboarding_completed_at when form is submitted", async () => {
    mockUpdatePreferences.mockResolvedValue({
      success: true,
      data: {
        preferred_language: "zh-TW",
        preferred_theme: "system",
        display_name: "TestUser",
        onboarding_completed_at: "2026-04-07T00:00:00Z",
      },
    });

    renderOnboarding();

    const nameInput = screen.getByLabelText("顯示名稱");
    fireEvent.change(nameInput, { target: { value: "TestUser" } });

    const submitBtn = screen.getByRole("button", { name: /開始使用/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
      const payload = mockUpdatePreferences.mock.calls[0][0];
      expect(payload).toHaveProperty("onboarding_completed_at");
      expect(payload.display_name).toBe("TestUser");
      expect(payload.preferred_language).toBe("zh-TW");
    });
  });

  it("should display validation error from backend", async () => {
    mockUpdatePreferences.mockRejectedValue({
      response: {
        data: {
          error: {
            message: "偏好設定驗證失敗",
          },
        },
      },
    });

    renderOnboarding();

    const nameInput = screen.getByLabelText("顯示名稱");
    fireEvent.change(nameInput, { target: { value: "TestUser" } });

    const submitBtn = screen.getByRole("button", { name: /開始使用/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/設定失敗/)).toBeInTheDocument();
    });
  });

  it("should not submit when user is null", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      setUser: vi.fn(),
      loading: false,
      checkUser: vi.fn(),
      logout: vi.fn(),
    });

    renderOnboarding();

    const submitBtn = screen.getByRole("button", { name: /開始使用/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockUpdatePreferences).not.toHaveBeenCalled();
    });
  });
});
