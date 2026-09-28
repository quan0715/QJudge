import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider, useTheme } from "./ThemeContext";

// Carbon's default class prefix, as returned by usePrefix().
const zone = (theme: string) => `${"cds"}--${theme}`;

describe("ThemeProvider", () => {
  beforeEach(() => {
    document.documentElement.className = "";
  });

  it("puts the active Carbon zone class on <html> and swaps it on theme change", () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    const root = document.documentElement;

    act(() => result.current.setPreference("dark"));

    expect(root).toHaveAttribute("data-carbon-theme", "g100");
    expect(root).toHaveClass(zone("g100"));

    act(() => result.current.setPreference("light"));

    expect(root).toHaveAttribute("data-carbon-theme", "white");
    expect(root).toHaveClass(zone("white"));
    expect(root).not.toHaveClass(zone("g100"));
  });
});
