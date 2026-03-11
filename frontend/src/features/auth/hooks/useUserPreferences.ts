import { useState, useCallback, useEffect, useRef } from "react";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { useContentLanguage } from "@/shared/contexts/ContentLanguageContext";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import {
  getUserPreferences,
  updateUserPreferences,
  changePassword as changePasswordApi,
  updateCurrentUserProfile,
  requestPasswordReset as requestPasswordResetApi,
} from "@/infrastructure/api/repositories/auth.repository";
import type {
  ThemePreference,
  UserPreferences,
  ChangePasswordRequest,
  UpdatePreferencesRequest,
  UpdateAccountProfileRequest,
} from "@/core/entities/auth.entity";

// Module-level state to prevent multiple instances from loading simultaneously
let globalLoadedForUserId: number | null = null;
let globalPreferencesCache: UserPreferences | null = null;
let globalLoadPromise: Promise<UserPreferences | null> | null = null;

export const __resetUserPreferencesCacheForTests = () => {
  globalLoadedForUserId = null;
  globalPreferencesCache = null;
  globalLoadPromise = null;
};

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
  requestPasswordReset: () => Promise<void>;

  // Account profile
  updateAccountProfile: (data: UpdateAccountProfileRequest) => Promise<void>;

  // Refresh
  refresh: () => Promise<void>;
}

export const useUserPreferences = (): UseUserPreferencesReturn => {
  const { user, setUser } = useAuth();
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

  const applyPreferencesToState = useCallback(
    (nextPreferences: UserPreferences) => {
      setPreferences(nextPreferences);
      // Sync backend preference into ThemeContext (single source of truth)
      setPreference(nextPreferences.preferred_theme);
      setContentLanguageRef.current(
        nextPreferences.preferred_language as typeof contentLanguage
      );
    },
    [setPreference]
  );

  // Load preferences from backend when user is logged in
  const loadPreferences = useCallback(async () => {
    if (!user) {
      globalLoadedForUserId = null;
      globalPreferencesCache = null;
      globalLoadPromise = null;
      setPreferences(null);
      return;
    }

    // User switched: clear stale cache from previous account.
    if (globalLoadedForUserId !== null && globalLoadedForUserId !== user.id) {
      globalLoadedForUserId = null;
      globalPreferencesCache = null;
      globalLoadPromise = null;
    }

    // Fast path: reuse cached preferences for this user.
    if (globalLoadedForUserId === user.id && globalPreferencesCache) {
      applyPreferencesToState(globalPreferencesCache);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    if (!globalLoadPromise) {
      globalLoadPromise = (async () => {
        const response = await getUserPreferences();
        if (response.success && response.data) {
          return response.data;
        }
        return null;
      })();
    }

    const pendingLoad = globalLoadPromise;

    try {
      const loadedPreferences = await pendingLoad;
      if (loadedPreferences) {
        globalPreferencesCache = loadedPreferences;
        globalLoadedForUserId = user.id;
        applyPreferencesToState(loadedPreferences);
      }
    } catch (err) {
      setError(err as Error);
      console.error("Failed to load preferences:", err);
    } finally {
      setLoading(false);
      if (globalLoadPromise === pendingLoad) {
        globalLoadPromise = null;
      }
    }
  }, [user, applyPreferencesToState]);

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
          setPreferences((prev) => {
            const base = prev ?? globalPreferencesCache;
            if (!base) return prev;
            const next = { ...base, preferred_theme: newPref };
            globalPreferencesCache = next;
            return next;
          });
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
          setPreferences((prev) => {
            const base = prev ?? globalPreferencesCache;
            if (!base) return prev;
            const next = { ...base, preferred_language: lang };
            globalPreferencesCache = next;
            return next;
          });
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
      setPreferences((prev) => {
        const base = prev ?? globalPreferencesCache;
        if (!base) return prev;
        const next = {
          ...base,
          ...(settings.fontSize !== undefined && {
            editor_font_size: settings.fontSize,
          }),
          ...(settings.tabSize !== undefined && {
            editor_tab_size: settings.tabSize,
          }),
        };
        globalPreferencesCache = next;
        return next;
      });

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
          setPreferences((prev) => {
            const base =
              prev ??
              globalPreferencesCache ?? {
                preferred_language: contentLanguage,
                preferred_theme: preference,
                editor_font_size: 12,
                editor_tab_size: 4 as 2 | 4,
              };
            const next = { ...base, display_name: name };
            globalPreferencesCache = next;
            return next;
          });
        } catch (err) {
          console.error("Failed to update display name:", err);
          throw err;
        }
      }
    },
    [user, contentLanguage, preference]
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

  const updateAccountProfile = useCallback(
    async (data: UpdateAccountProfileRequest) => {
      if (!user) {
        throw new Error("Must be logged in to update profile");
      }

      const response = await updateCurrentUserProfile(data);
      const nextUser = response.data;
      setUser(nextUser);
      localStorage.setItem("user", JSON.stringify(nextUser));
      window.dispatchEvent(new Event("storage"));
    },
    [user, setUser]
  );

  const requestPasswordReset = useCallback(async () => {
    if (!user?.email) {
      throw new Error("Email is required for password reset");
    }
    await requestPasswordResetApi({ email: user.email });
  }, [user?.email]);

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
    displayName: preferences?.display_name ?? user?.profile?.display_name ?? '',
    updateDisplayName,
    changePassword,
    requestPasswordReset,
    updateAccountProfile,
    refresh: loadPreferences,
  };
};
