import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ContentLanguageProvider, useContentLanguage } from "@/shared/contexts/ContentLanguageContext";
import { ThemeProvider } from "@/shared/ui/theme/ThemeContext";
import { __resetUserPreferencesCacheForTests } from "@/features/auth/hooks/useUserPreferences";
import { PreferencesPanel } from "./PreferencesPanel";

const changeLanguage = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, defaultOrOptions?: unknown) =>
      typeof defaultOrOptions === "string" ? defaultOrOptions : key,
    i18n: { language: "zh-TW", changeLanguage },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/features/auth/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, setUser: vi.fn() }),
}));

vi.mock("@/infrastructure/api/repositories/user.repository", () => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  uploadAvatar: vi.fn(),
  updateAccountProfile: vi.fn(),
}));

const ContentLanguageProbe = () => {
  const { contentLanguage } = useContentLanguage();
  return <output data-testid="content-language">{contentLanguage}</output>;
};

const renderPanel = () =>
  render(
    <ThemeProvider>
      <ContentLanguageProvider>
        <PreferencesPanel />
        <ContentLanguageProbe />
      </ContentLanguageProvider>
    </ThemeProvider>,
  );

const choose = (dropdownTestId: string, optionText: string) => {
  fireEvent.click(within(screen.getByTestId(dropdownTestId)).getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: optionText }));
};

describe("PreferencesPanel", () => {
  beforeAll(() => {
    // jsdom lacks scrollIntoView, which Carbon's Dropdown calls on open.
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    changeLanguage.mockClear();
    localStorage.clear();
    __resetUserPreferencesCacheForTests();
  });

  it("switches the interface language immediately", async () => {
    renderPanel();

    choose("settings-language-dropdown", "English");

    await waitFor(() => expect(screen.getByTestId("content-language")).toHaveTextContent("en"));
    expect(changeLanguage).toHaveBeenCalledWith("en");
  });

  it("applies the chosen theme to the document without a reload", async () => {
    renderPanel();

    choose("settings-theme-dropdown", "theme.dark");
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-carbon-theme", "g100"));

    choose("settings-theme-dropdown", "theme.light");
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-carbon-theme", "white"));
  });
});
