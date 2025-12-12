import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { Theme } from "@carbon/react";

type ThemeType = "white" | "g100" | "g90" | "g10";
type ThemePreference = "light" | "dark" | "system";

interface ThemeContextType {
  theme: ThemeType;
  toggleTheme: () => void;
  setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Unified localStorage key - same as useUserPreferences
const THEME_PREFERENCE_KEY = "themePreference";

// Get system preferred theme
const getSystemTheme = (): ThemeType => {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "g100"
      : "white";
  }
  return "g100";
};

// Convert preference to Carbon theme
const preferenceToTheme = (pref: ThemePreference): ThemeType => {
  if (pref === "system") return getSystemTheme();
  return pref === "dark" ? "g100" : "white";
};

// Convert Carbon theme to preference
const themeToPreference = (theme: ThemeType): ThemePreference => {
  return theme === "g100" || theme === "g90" ? "dark" : "light";
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeType>("g100");

  // Initialize from localStorage (using unified key)
  useEffect(() => {
    const savedPref = localStorage.getItem(
      THEME_PREFERENCE_KEY
    ) as ThemePreference;
    if (savedPref) {
      setThemeState(preferenceToTheme(savedPref));
    } else {
      // Fallback: check old key for migration
      const oldTheme = localStorage.getItem("theme") as ThemeType;
      if (oldTheme) {
        setThemeState(oldTheme);
        // Migrate to new key
        localStorage.setItem(THEME_PREFERENCE_KEY, themeToPreference(oldTheme));
        localStorage.removeItem("theme");
      }
    }
  }, []);

  // Listen for system theme changes when preference is "system"
  useEffect(() => {
    const savedPref = localStorage.getItem(
      THEME_PREFERENCE_KEY
    ) as ThemePreference;
    if (savedPref === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        setThemeState(e.matches ? "g100" : "white");
      };
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-carbon-theme", theme);
  }, [theme]);

  const setTheme = (newTheme: ThemeType) => {
    setThemeState(newTheme);
    // Note: Don't save to localStorage here!
    // useUserPreferences handles saving the preference (including "system")
    // If we save here, "system" preference would be lost (converted to "light"/"dark")
  };

  const toggleTheme = () => {
    const newTheme = theme === "white" ? "g100" : "white";
    setThemeState(newTheme);
    // Save when using toggleTheme directly (not via useUserPreferences)
    localStorage.setItem(THEME_PREFERENCE_KEY, themeToPreference(newTheme));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
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
