import { expect, test } from "@playwright/test";
import { clearAuth } from "../helpers/auth.helper";
import { registerFreshAccount } from "../helpers/pending-actions.helper";

test.describe("Registration + pending actions", () => {
  test("register goes directly to onboarding without re-login", async ({ page }) => {
    await page.goto("/register", { waitUntil: "domcontentloaded" });
    await clearAuth(page);

    await registerFreshAccount(page);

    await page.waitForURL(/\/onboarding/, { timeout: 15000 });

    expect(page.url()).toContain("/onboarding");
    expect(page.url()).not.toContain("/login");
  });

  test("pending magic link survives login→register navigation", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await clearAuth(page);

    await page.evaluate(() => {
      sessionStorage.setItem("qjudge.magic_link_token", "FAKECODE");
    });

    await page.getByTestId("auth-login-nav-register").click();
    await page.waitForURL(/\/register/, { timeout: 10000 });

    const token = await page.evaluate(() =>
      sessionStorage.getItem("qjudge.magic_link_token"),
    );

    expect(token).toBe("FAKECODE");
  });
});
