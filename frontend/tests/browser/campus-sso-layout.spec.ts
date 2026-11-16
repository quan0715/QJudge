import { test, expect } from "@playwright/test";

for (const width of [390, 672, 673, 1280]) {
  test(`campus SSO shows one action row at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/v1/auth/providers", route => route.fulfill({ json: {
      meta: {}, data: { password_enabled: true, providers: [
        { key: "school", type: "oidc", category: "campus", display_name: "Test University" },
      ] },
    } }));
    await page.goto("/login/campus-sso");
    const back = page.locator('[data-testid^="auth-campus-sso-"][data-testid$="-back"]:visible');
    const submit = page.locator('[data-testid^="auth-campus-sso-"][data-testid$="-submit"]:visible');
    await expect(back).toHaveCount(1);
    await expect(submit).toHaveCount(1);
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("data-testid", width <= 672
      ? "auth-campus-sso-mobile-submit" : "auth-campus-sso-submit");
    const school = page.getByRole("button", { name: /Test University/ });
    await school.focus();
    await school.press("Enter");
    await expect(school).toHaveAttribute("aria-pressed", "true");
    await expect(submit).toBeEnabled();
    const screenshot = info.outputPath(`campus-sso-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await info.attach(`campus-sso-${width}`, { path: screenshot, contentType: "image/png" });
    await back.click();
    await expect(page).toHaveURL(/\/login$/);
  });
}
