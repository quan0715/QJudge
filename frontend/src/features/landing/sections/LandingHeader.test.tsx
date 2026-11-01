import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Asleep, Light } from "@carbon/icons-react";
import LandingHeader from "./LandingHeader";

beforeEach(() => {
  // jsdom has no layout; Carbon waits for non-zero geometry before revealing its menu.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 160, bottom: 48,
    width: 160, height: 48, toJSON: () => ({}),
  });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const props = {
  items: [
    { id: "features", label: "Features" },
    { id: "docs", label: "Docs", href: "/docs" },
  ],
  onLogin: vi.fn(),
  languageValue: "en" as const,
  languageOptions: [
    { value: "zh-TW" as const, label: "繁體中文", shortLabel: "中" },
    { value: "en" as const, label: "English", shortLabel: "EN" },
    { value: "ja" as const, label: "日本語", shortLabel: "日" },
    { value: "ko" as const, label: "한국어", shortLabel: "한" },
  ],
  onLanguageChange: vi.fn(),
  themeValue: "dark" as const,
  themeOptions: [
    { value: "light" as const, label: "Light", icon: Light },
    { value: "dark" as const, label: "Dark", icon: Asleep },
  ],
  onThemeChange: vi.fn(),
};

describe("landing navigation menus", () => {
  it("keeps section links and sign-in in the Action dropdown", async () => {
    render(<LandingHeader {...props} />);
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ui.actions" }));
    expect(await screen.findByRole("menuitem", { name: "Features" })).toHaveAttribute("href", "#features");
    expect(screen.getByRole("menuitem", { name: "Docs" })).toHaveAttribute("href", "/docs");
    fireEvent.click(screen.getByRole("menuitem", { name: "ui.signIn" }));
    expect(props.onLogin).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("keeps all four languages and identifies the current selection", async () => {
    render(<LandingHeader {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "ui.language" }));
    expect(await screen.findAllByRole("menuitemradio")).toHaveLength(4);
    expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveAttribute("aria-checked", "true");
    const japanese = screen.getByRole("menuitemradio", { name: "日本語" });
    japanese.focus();
    fireEvent.click(japanese, { detail: 0 });
    expect(props.onLanguageChange).toHaveBeenCalledWith("ja");
    expect(screen.getByRole("button", { name: "ui.language" })).toHaveFocus();
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
  });

  it("keeps both themes and identifies the current selection", async () => {
    render(<LandingHeader {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "ui.theme" }));
    expect(await screen.findByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    const light = screen.getByRole("menuitemradio", { name: "Light" });
    light.focus();
    fireEvent.click(light, { detail: 0 });
    expect(props.onThemeChange).toHaveBeenCalledWith("light");
    expect(screen.getByRole("button", { name: "ui.theme" })).toHaveFocus();
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
  });

  it("supports arrow navigation and returns focus to the trigger on Escape", async () => {
    render(<LandingHeader {...props} />);
    const trigger = screen.getByRole("button", { name: "ui.actions" });
    fireEvent.click(trigger);
    const first = await screen.findByRole("menuitem", { name: "Features" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const second = screen.getByRole("menuitem", { name: "Docs" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "Escape" });
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes the open dropdown when clicking outside", async () => {
    render(<LandingHeader {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "ui.language" }));
    await screen.findByRole("menuitemradio", { name: "English" });
    fireEvent.click(document.body);
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
  });
});
