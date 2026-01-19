import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useUserPreferences } from "./useUserPreferences";

// Mock the auth service
vi.mock("@/infrastructure/api/repositories/auth.repository", () => ({
  getUserPreferences: vi.fn(),
  updateUserPreferences: vi.fn(),
  changePassword: vi.fn(),
}));

// Mock the auth context
vi.mock("@/features/auth/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    user: null,
  })),
}));

// Mock the theme context
vi.mock("@/shared/ui/theme/ThemeContext", () => ({
  useTheme: vi.fn(() => ({
    theme: "g100",
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
  })),
}));

// Mock the content language context
vi.mock("@/shared/contexts/ContentLanguageContext", () => ({
  useContentLanguage: vi.fn(() => ({
    contentLanguage: "zh-TW",
    setContentLanguage: vi.fn(),
  })),
}));

import {
  getUserPreferences,
  updateUserPreferences,
  changePassword,
} from "@/infrastructure/api/repositories/auth.repository";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { useContentLanguage } from "@/shared/contexts/ContentLanguageContext";

const mockPreferences = {
  preferred_language: "zh-TW",
  preferred_theme: "dark" as const,
  editor_font_size: 14,
  editor_tab_size: 4 as const,
};

describe("useUserPreferences", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();

    // Mock window.matchMedia for system theme detection
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    // Reset mocks with default implementations
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      setUser: vi.fn(),
      checkUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(useTheme).mockReturnValue({
      theme: "g100",
      setTheme: vi.fn(),
      toggleTheme: vi.fn(),
    });

    vi.mocked(useContentLanguage).mockReturnValue({
      contentLanguage: "zh-TW",
      setContentLanguage: vi.fn(),
      toggleLanguage: vi.fn(),
      supportedLanguages: [
        { id: "zh-TW", label: "繁體中文", shortLabel: "中" },
        { id: "en", label: "English", shortLabel: "EN" },
      ] as any,
      getCurrentLanguageLabel: vi.fn(() => "繁體中文"),
      getCurrentLanguageShortLabel: vi.fn(() => "中"),
    });
  });

  it("should have default values when user is not logged in", () => {
    const { result } = renderHook(() => useUserPreferences());

    expect(result.current.loading).toBe(false);
    expect(result.current.preferences).toBeNull();
    expect(result.current.themePreference).toBe("system");
    expect(result.current.language).toBe("zh-TW");
  });

  it("should load preferences from backend when user is logged in", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 1,
        username: "test",
        email: "test@test.com",
        role: "student",
      },
      loading: false,
      setUser: vi.fn(),
      checkUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(getUserPreferences).mockResolvedValue({
      success: true,
      data: mockPreferences,
    });

    const { result } = renderHook(() => useUserPreferences());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getUserPreferences).toHaveBeenCalled();
    expect(result.current.preferences).toEqual(mockPreferences);
    expect(result.current.themePreference).toBe("dark");
  });

  it("should update theme preference", async () => {
    const setTheme = vi.fn();
    vi.mocked(useTheme).mockReturnValue({
      theme: "g100",
      setTheme,
      toggleTheme: vi.fn(),
    });

    const { result } = renderHook(() => useUserPreferences());

    await act(async () => {
      await result.current.updateTheme("light");
    });

    expect(result.current.themePreference).toBe("light");
  });

  it("should sync theme preference to backend when logged in", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 1,
        username: "test",
        email: "test@test.com",
        role: "student",
      },
      loading: false,
      setUser: vi.fn(),
      checkUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(getUserPreferences).mockResolvedValue({
      success: true,
      data: mockPreferences,
    });

    vi.mocked(updateUserPreferences).mockResolvedValue({
      success: true,
      data: { ...mockPreferences, preferred_theme: "light" },
    });

    const { result } = renderHook(() => useUserPreferences());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateTheme("light");
    });

    expect(updateUserPreferences).toHaveBeenCalledWith({
      preferred_theme: "light",
    });
  });

  it("should update language preference", async () => {
    const setContentLanguage = vi.fn();
    vi.mocked(useContentLanguage).mockReturnValue({
      contentLanguage: "zh-TW",
      setContentLanguage,
      toggleLanguage: vi.fn(),
      supportedLanguages: [] as any,
      getCurrentLanguageLabel: vi.fn(),
      getCurrentLanguageShortLabel: vi.fn(),
    });

    const { result } = renderHook(() => useUserPreferences());

    await act(async () => {
      await result.current.updateLanguage("en");
    });

    expect(setContentLanguage).toHaveBeenCalledWith("en");
  });

  it("should update editor settings", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 1,
        username: "test",
        email: "test@test.com",
        role: "student",
      },
      loading: false,
      setUser: vi.fn(),
      checkUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(getUserPreferences).mockResolvedValue({
      success: true,
      data: mockPreferences,
    });

    vi.mocked(updateUserPreferences).mockResolvedValue({
      success: true,
      data: { ...mockPreferences, editor_font_size: 16, editor_tab_size: 2 },
    });

    const { result } = renderHook(() => useUserPreferences());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateEditorSettings({ fontSize: 16, tabSize: 2 });
    });

    expect(updateUserPreferences).toHaveBeenCalledWith({
      editor_font_size: 16,
      editor_tab_size: 2,
    });
  });

  it("should change password for logged in user", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 1,
        username: "test",
        email: "test@test.com",
        role: "student",
      },
      loading: false,
      setUser: vi.fn(),
      checkUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(getUserPreferences).mockResolvedValue({
      success: true,
      data: mockPreferences,
    });

    vi.mocked(changePassword).mockResolvedValue({
      success: true,
      message: "Password changed",
    });

    const { result } = renderHook(() => useUserPreferences());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const passwordData = {
      current_password: "oldpass",
      new_password: "newpass123",
      new_password_confirm: "newpass123",
    };

    await act(async () => {
      await result.current.changePassword(passwordData);
    });

    expect(changePassword).toHaveBeenCalledWith(passwordData);
  });

  it("should throw error when changing password without being logged in", async () => {
    const { result } = renderHook(() => useUserPreferences());

    await expect(
      result.current.changePassword({
        current_password: "old",
        new_password: "new",
        new_password_confirm: "new",
      })
    ).rejects.toThrow("Must be logged in to change password");
  });

  it("should handle error when loading preferences fails", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 1,
        username: "test",
        email: "test@test.com",
        role: "student",
      },
      loading: false,
      setUser: vi.fn(),
      checkUser: vi.fn(),
      logout: vi.fn(),
    });

    const mockError = new Error("Network error");
    vi.mocked(getUserPreferences).mockRejectedValue(mockError);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useUserPreferences());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toEqual(mockError);
  });

  it("should return default editor settings when preferences not loaded", () => {
    const { result } = renderHook(() => useUserPreferences());

    expect(result.current.editorFontSize).toBe(12);
    expect(result.current.editorTabSize).toBe(4);
  });

  it("should calculate effective theme based on system preference when set to system", () => {
    // Mock matchMedia for dark mode
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const { result } = renderHook(() => useUserPreferences());

    // When themePreference is 'system', effectiveTheme should be based on system
    expect(result.current.themePreference).toBe("system");
    expect(result.current.effectiveTheme).toBe("dark");
  });
});
