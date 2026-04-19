import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { Theme } from "@carbon/react";

type ThemeType = "white" | "g100" | "g90" | "g10";
type ThemePreference = "light" | "dark" | "system";

interface ThemeContextType {
  theme: ThemeType;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_PREFERENCE_KEY = "themePreference";

/** Matches Carbon layer background for browser chrome (theme-color) on mobile. */
function themeChromeColor(t: ThemeType): string {
  if (t === "g100" || t === "g90") return "#161616";
  return "#ffffff";
}

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

  // Sync data-carbon-theme + root background + theme-color (iOS Safari / Android Chrome)
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-carbon-theme", theme);
    const bg = themeChromeColor(theme);
    root.style.backgroundColor = bg;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", bg);
  }, [theme]);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    localStorage.setItem(THEME_PREFERENCE_KEY, pref);
    if (pref !== "system") {
      setThemeState(pref === "dark" ? "g100" : "white");
    }
    // system case is handled by the useEffect above
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference }}>
      <Theme theme={theme}>
        {children}
        <div id="modal-portal-root" />
      </Theme>
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
