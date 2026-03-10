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

  // Display name
  displayName: string;
  updateDisplayName: (name: string) => Promise<void>;

  // Password
  changePassword: (data: ChangePasswordRequest) => Promise<void>;

  // Refresh
  refresh: () => Promise<void>;
}

export const useUserPreferences = (): UseUserPreferencesReturn => {
  const { user } = useAuth();
  const { preference, setPreference, theme } = useTheme();
  const { setContentLanguage, contentLanguage } = useContentLanguage();

  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Derive effectiveTheme from ThemeContext's resolved theme
  const effectiveTheme: "light" | "dark" =
    theme === "g100" || theme === "g90" ? "dark" : "light";

  // Store setContentLanguage in a ref to avoid dependency issues
  const setContentLanguageRef = useRef(setContentLanguage);
  setContentLanguageRef.current = setContentLanguage;

  // Load preferences from backend when user is logged in
  const loadPreferences = useCallback(async () => {
    if (!user) {
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
        // Sync backend preference into ThemeContext (single source of truth)
        setPreference(response.data.preferred_theme);
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
  }, [user, setPreference]);  

  // Load preferences on mount or when user changes
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Update theme preference
  const updateTheme = useCallback(
    async (newPref: ThemePreference) => {
      // Update ThemeContext (which also persists to localStorage)
      setPreference(newPref);

      if (user) {
        try {
          await updateUserPreferences({ preferred_theme: newPref });
          setPreferences((prev) =>
            prev ? { ...prev, preferred_theme: newPref } : null
          );
        } catch (err) {
          console.error("Failed to update theme preference:", err);
          throw err;
        }
      }
    },
    [user, setPreference]
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

  // Update display name
  const updateDisplayName = useCallback(
    async (name: string) => {
      if (user) {
        try {
          await updateUserPreferences({ display_name: name });
          setPreferences((prev) =>
            prev ? { ...prev, display_name: name } : null
          );
        } catch (err) {
          console.error("Failed to update display name:", err);
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
    themePreference: preference,
    effectiveTheme,
    updateTheme,
    language: contentLanguage,
    updateLanguage,
    editorFontSize: preferences?.editor_font_size ?? 12,
    editorTabSize: preferences?.editor_tab_size ?? 4,
    updateEditorSettings,
    displayName: preferences?.display_name ?? '',
    updateDisplayName,
    changePassword,
    refresh: loadPreferences,
  };
};
