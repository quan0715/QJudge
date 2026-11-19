import { act, renderHook, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ThemeProvider, useTheme } from "@/shared/ui/theme/ThemeContext";
import { BrandLockup } from "./BrandLockup";

it("changes the @Edu lockup with the active theme", () => {
  const { result } = renderHook(useTheme, {
    wrapper: ({ children }) => (
      <ThemeProvider>
        <BrandLockup />
        {children}
      </ThemeProvider>
    ),
  });
  act(() => result.current.setPreference("light"));
  expect(screen.getByRole("img", { name: "QJudge @Edu" })).toHaveAttribute(
    "src", "/brand/qjudge-edu-logo-light.svg",
  );

  act(() => result.current.setPreference("dark"));
  expect(screen.getByRole("img", { name: "QJudge @Edu" })).toHaveAttribute(
    "src", "/brand/qjudge-edu-logo-dark.svg",
  );
});
