import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { Theme } from "@carbon/react";

type ThemeType = "white" | "g100" | "g90" | "g10";
type ThemePreference = "light" | "dark" | "system";

interface ThemeContextType {
  theme: ThemeType;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  /** @deprecated Use setPreference instead */
  toggleTheme: () => void;
  /** @deprecated Use setPreference instead */
  setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_PREFERENCE_KEY = "themePreference";

const getSystemTheme = (): ThemeType => {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "g100"
      : "white";
  }
  return "g100";
};

const preferenceToTheme = (pref: ThemePreference): ThemeType => {
  if (pref === "system") return getSystemTheme();
  return pref === "dark" ? "g100" : "white";
};

const getInitialPreference = (): ThemePreference => {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(THEME_PREFERENCE_KEY) as ThemePreference;
    if (saved && ["light", "dark", "system"].includes(saved)) {
      return saved;
    }
    // Migrate old "theme" key
    const oldTheme = localStorage.getItem("theme") as ThemeType;
    if (oldTheme) {
      const pref: ThemePreference =
        oldTheme === "g100" || oldTheme === "g90" ? "dark" : "light";
      localStorage.setItem(THEME_PREFERENCE_KEY, pref);
      localStorage.removeItem("theme");
      return pref;
    }
  }
  return "system";
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(getInitialPreference);
  const [theme, setThemeState] = useState<ThemeType>(() => preferenceToTheme(getInitialPreference()));

  // Single system theme listener — only active when preference === "system"
  useEffect(() => {
    if (preference !== "system") return;

    // Apply current system theme immediately
    setThemeState(getSystemTheme());

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? "g100" : "white");
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [preference]);

  // Sync data-carbon-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-carbon-theme", theme);
  }, [theme]);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    localStorage.setItem(THEME_PREFERENCE_KEY, pref);
    if (pref !== "system") {
      setThemeState(pref === "dark" ? "g100" : "white");
    }
    // system case is handled by the useEffect above
  }, []);

  // Legacy compat — setTheme without saving preference (used by useUserPreferences backend sync)
  const setTheme = useCallback((newTheme: ThemeType) => {
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(theme === "white" ? "dark" : "light");
  }, [theme, setPreference]);

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference, toggleTheme, setTheme }}>
      <Theme theme={theme}>{children}</Theme>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
