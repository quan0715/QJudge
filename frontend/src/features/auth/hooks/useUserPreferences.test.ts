import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useUserPreferences,
  __resetUserPreferencesCacheForTests,
} from "./useUserPreferences";

// Mock the user service
vi.mock("@/infrastructure/api/repositories/user.repository", () => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  uploadAvatar: vi.fn(),
  updateAccountProfile: vi.fn(),
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
    preference: "system",
    setPreference: vi.fn(),
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
  getPreferences,
  updatePreferences,
  updateAccountProfile as updateCurrentUserProfile,
} from "@/infrastructure/api/repositories/user.repository";
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
    __resetUserPreferencesCacheForTests();

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
      preference: "system",
      setPreference: vi.fn(),
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

    vi.mocked(getPreferences).mockResolvedValue({
      success: true,
      data: mockPreferences,
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
    // Track preference value so setPreference updates it
    let currentPreference: string = "system";
    const setPreference = vi.fn((val: string) => {
      currentPreference = val;
    });
    vi.mocked(useTheme).mockImplementation(() => ({
      theme: "g100",
      preference: currentPreference as any,
      setPreference,
      setTheme: vi.fn(),
      toggleTheme: vi.fn(),
    }));

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

    vi.mocked(getPreferences).mockResolvedValue({
      success: true,
      data: mockPreferences,
    });

    const { result } = renderHook(() => useUserPreferences());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getPreferences).toHaveBeenCalled();
    expect(result.current.preferences).toEqual(mockPreferences);
    expect(setPreference).toHaveBeenCalledWith("dark");
    expect(result.current.themePreference).toBe("dark");
  });

  it("should update theme preference", async () => {
    const setPreference = vi.fn();
    vi.mocked(useTheme).mockReturnValue({
      theme: "g100",
      preference: "system",
      setPreference,
      setTheme: vi.fn(),
      toggleTheme: vi.fn(),
    });

    const { result } = renderHook(() => useUserPreferences());

    await act(async () => {
      await result.current.updateTheme("light");
    });

    expect(setPreference).toHaveBeenCalledWith("light");
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

    vi.mocked(getPreferences).mockResolvedValue({
      success: true,
      data: mockPreferences,
    });

    vi.mocked(updatePreferences).mockResolvedValue({
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

    expect(updatePreferences).toHaveBeenCalledWith({
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

  it("should keep optimistic language when stale load resolves later", async () => {
    const setContentLanguage = vi.fn();
    vi.mocked(useContentLanguage).mockReturnValue({
      contentLanguage: "zh-TW",
      setContentLanguage,
      toggleLanguage: vi.fn(),
      supportedLanguages: [] as any,
      getCurrentLanguageLabel: vi.fn(),
      getCurrentLanguageShortLabel: vi.fn(),
    });

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

    vi.mocked(updatePreferences).mockResolvedValue({
      success: true,
      data: { ...mockPreferences, preferred_language: "en" },
    });

    let resolvePreferences: ((value: { success: true; data: typeof mockPreferences }) => void) | null = null;
    const delayedPreferences = new Promise<{ success: true; data: typeof mockPreferences }>((resolve) => {
      resolvePreferences = resolve;
    });
    vi.mocked(getPreferences).mockReturnValue(delayedPreferences as any);

    const { result } = renderHook(() => useUserPreferences());

    await act(async () => {
      await result.current.updateLanguage("en");
    });

    await act(async () => {
      resolvePreferences?.({ success: true, data: mockPreferences });
      await delayedPreferences;
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(setContentLanguage).toHaveBeenCalledWith("en");
    expect(setContentLanguage).not.toHaveBeenLastCalledWith("zh-TW");
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

    vi.mocked(getPreferences).mockResolvedValue({
      success: true,
      data: mockPreferences,
    });

    vi.mocked(updatePreferences).mockResolvedValue({
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

    expect(updatePreferences).toHaveBeenCalledWith({
      editor_font_size: 16,
      editor_tab_size: 2,
    });
  });

  it("should update account profile and sync local user cache", async () => {
    const setUser = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 1,
        username: "test",
        email: "test@test.com",
        role: "student",
      },
      loading: false,
      setUser,
      checkUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(updateCurrentUserProfile).mockResolvedValue({
      success: true,
      data: {
        id: 1,
        username: "next-user",
        email: "next@test.com",
        role: "student",
      },
    } as any);

    const { result } = renderHook(() => useUserPreferences());

    await act(async () => {
      await result.current.updateAccountProfile({
        username: "next-user",
        email: "next@test.com",
      });
    });

    expect(updateCurrentUserProfile).toHaveBeenCalledWith({
      username: "next-user",
      email: "next@test.com",
    });
    expect(setUser).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "next-user",
        email: "next@test.com",
      })
    );
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
    vi.mocked(getPreferences).mockRejectedValue(mockError);
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

  it("should reuse cached preferences across hook instances", async () => {
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

    vi.mocked(getPreferences).mockResolvedValue({
      success: true,
      data: { ...mockPreferences, display_name: "Cached Name" },
    });

    const first = renderHook(() => useUserPreferences());
    await waitFor(() => {
      expect(first.result.current.loading).toBe(false);
      expect(first.result.current.displayName).toBe("Cached Name");
    });

    const second = renderHook(() => useUserPreferences());
    await waitFor(() => {
      expect(second.result.current.loading).toBe(false);
      expect(second.result.current.displayName).toBe("Cached Name");
    });

    expect(getPreferences).toHaveBeenCalledTimes(1);
  });

  // ── Incident 2026-04-07 regression tests ──────────────────────────

  it("should apply backend preferred_language to ContentLanguageContext", async () => {
    const mockSetContentLanguage = vi.fn();
    vi.mocked(useContentLanguage).mockReturnValue({
      contentLanguage: "zh-TW",
      setContentLanguage: mockSetContentLanguage,
      toggleLanguage: vi.fn(),
      supportedLanguages: [
        { id: "zh-TW", label: "繁體中文", shortLabel: "中" },
        { id: "en", label: "English", shortLabel: "EN" },
        { id: "ja", label: "日本語", shortLabel: "日" },
        { id: "ko", label: "한국어", shortLabel: "한" },
      ] as any,
      getCurrentLanguageLabel: vi.fn(),
      getCurrentLanguageShortLabel: vi.fn(),
    });
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
    vi.mocked(getPreferences).mockResolvedValue({
      success: true,
      data: { ...mockPreferences, preferred_language: "en" },
    });

    renderHook(() => useUserPreferences());

    await waitFor(() => {
      expect(mockSetContentLanguage).toHaveBeenCalledWith("en");
    });
  });

  it("should send valid language when updateLanguage is called", async () => {
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
    vi.mocked(getPreferences).mockResolvedValue({
      success: true,
      data: mockPreferences,
    });
    vi.mocked(updatePreferences).mockResolvedValue({
      success: true,
      data: { ...mockPreferences, preferred_language: "ja" },
    });

    const { result } = renderHook(() => useUserPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateLanguage("ja");
    });

    expect(updatePreferences).toHaveBeenCalledWith({ preferred_language: "ja" });
  });
});
