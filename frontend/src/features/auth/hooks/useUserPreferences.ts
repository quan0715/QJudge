import { useState, useCallback, useEffect, useRef } from "react";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { useContentLanguage } from "@/shared/contexts/ContentLanguageContext";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import {
  getUserPreferences,
  updateUserPreferences,
  changePassword as changePasswordApi,
} from "@/infrastructure/api/repositories/auth.repository";
import type {
  ThemePreference,
  UserPreferences,
  ChangePasswordRequest,
  UpdatePreferencesRequest,
} from "@/core/entities/auth.entity";

// Map between user preference theme and Carbon theme
const themeMap = {
  light: "white" as const,
  dark: "g100" as const,
};

// Get system preferred theme
const getSystemTheme = (): "light" | "dark" => {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "dark";
};

// Module-level state to prevent multiple instances from loading simultaneously
let globalLoadedForUserId: number | null = null;
let globalIsLoading = false;

export interface UseUserPreferencesReturn {
  // Current preferences
  preferences: UserPreferences | null;
  loading: boolean;
  error: Error | null;

  // Theme
  themePreference: ThemePreference;
  effectiveTheme: "light" | "dark";
  updateTheme: (theme: ThemePreference) => Promise<void>;

  // Language
  language: string;
  updateLanguage: (lang: string) => Promise<void>;

  // Editor settings
  editorFontSize: number;
  editorTabSize: 2 | 4;
  updateEditorSettings: (settings: {
    fontSize?: number;
    tabSize?: 2 | 4;
  }) => Promise<void>;

  // Password
  changePassword: (data: ChangePasswordRequest) => Promise<void>;

  // Refresh
  refresh: () => Promise<void>;
}

// Get initial theme preference from localStorage
const getInitialThemePreference = (): ThemePreference => {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("themePreference") as ThemePreference;
    if (saved && ["light", "dark", "system"].includes(saved)) {
      return saved;
    }
  }
  return "system";
};

export const useUserPreferences = (): UseUserPreferencesReturn => {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const { setContentLanguage, contentLanguage } = useContentLanguage();

  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Initialize from localStorage instead of defaulting to "system"
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    getInitialThemePreference
  );
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(
    getSystemTheme()
  );

  // Calculate effective theme
  const effectiveTheme =
    themePreference === "system" ? systemTheme : themePreference;

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Apply theme when effective theme changes
  useEffect(() => {
    setTheme(themeMap[effectiveTheme]);
  }, [effectiveTheme, setTheme]);

  // Store setContentLanguage in a ref to avoid dependency issues
  const setContentLanguageRef = useRef(setContentLanguage);
  setContentLanguageRef.current = setContentLanguage;

  // Load preferences from backend when user is logged in
  const loadPreferences = useCallback(async () => {
    if (!user) {
      // Load from localStorage for non-logged-in users
      const savedTheme = localStorage.getItem(
        "themePreference"
      ) as ThemePreference;
      if (savedTheme) {
        setThemePreference(savedTheme);
      }
      globalLoadedForUserId = null;
      return;
    }

    // Skip if already loading or already loaded for this user (using global state)
    if (globalIsLoading || globalLoadedForUserId === user.id) {
      return;
    }

    globalIsLoading = true;
    setLoading(true);
    setError(null);

    try {
      const response = await getUserPreferences();
      if (response.success && response.data) {
        setPreferences(response.data);
        setThemePreference(response.data.preferred_theme);
        // Use ref to avoid dependency on setContentLanguage
        setContentLanguageRef.current(
          response.data.preferred_language as typeof contentLanguage
        );
        globalLoadedForUserId = user.id;
      }
    } catch (err) {
      setError(err as Error);
      console.error("Failed to load preferences:", err);
    } finally {
      setLoading(false);
      globalIsLoading = false;
    }
  }, [user]); // Only depend on user

  // Load preferences on mount or when user changes
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Update theme preference
  const updateTheme = useCallback(
    async (theme: ThemePreference) => {
      setThemePreference(theme);
      localStorage.setItem("themePreference", theme);

      if (user) {
        try {
          await updateUserPreferences({ preferred_theme: theme });
          setPreferences((prev) =>
            prev ? { ...prev, preferred_theme: theme } : null
          );
        } catch (err) {
          console.error("Failed to update theme preference:", err);
          throw err;
        }
      }
    },
    [user]
  );

  // Update language preference
  const updateLanguage = useCallback(
    async (lang: string) => {
      setContentLanguage(lang as typeof contentLanguage);

      if (user) {
        try {
          await updateUserPreferences({ preferred_language: lang });
          setPreferences((prev) =>
            prev ? { ...prev, preferred_language: lang } : null
          );
        } catch (err) {
          console.error("Failed to update language preference:", err);
          throw err;
        }
      }
    },
    [user, setContentLanguage]
  );

  // Update editor settings
  const updateEditorSettings = useCallback(
    async (settings: { fontSize?: number; tabSize?: 2 | 4 }) => {
      const updates: UpdatePreferencesRequest = {};

      if (settings.fontSize !== undefined) {
        updates.editor_font_size = settings.fontSize;
      }
      if (settings.tabSize !== undefined) {
        updates.editor_tab_size = settings.tabSize;
      }

      // Update localStorage for immediate effect
      if (settings.fontSize !== undefined) {
        localStorage.setItem("editorFontSize", String(settings.fontSize));
      }
      if (settings.tabSize !== undefined) {
        localStorage.setItem("editorTabSize", String(settings.tabSize));
      }

      // Update local state
      setPreferences((prev) =>
        prev
          ? {
              ...prev,
              ...(settings.fontSize !== undefined && {
                editor_font_size: settings.fontSize,
              }),
              ...(settings.tabSize !== undefined && {
                editor_tab_size: settings.tabSize,
              }),
            }
          : null
      );

      if (user) {
        try {
          await updateUserPreferences(updates);
        } catch (err) {
          console.error("Failed to update editor settings:", err);
          throw err;
        }
      }
    },
    [user]
  );

  // Change password
  const changePassword = useCallback(
    async (data: ChangePasswordRequest) => {
      if (!user) {
        throw new Error("Must be logged in to change password");
      }

      await changePasswordApi(data);
    },
    [user]
  );

  return {
    preferences,
    loading,
    error,
    themePreference,
    effectiveTheme,
    updateTheme,
    language: contentLanguage,
    updateLanguage,
    editorFontSize: preferences?.editor_font_size ?? 12,
    editorTabSize: preferences?.editor_tab_size ?? 4,
    updateEditorSettings,
    changePassword,
    refresh: loadPreferences,
  };
};
