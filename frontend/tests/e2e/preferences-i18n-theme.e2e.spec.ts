import { test, expect, Page } from "@playwright/test";
import { clearAuth, loginViaAPI } from "../helpers/auth.helper";

const LANGUAGE_OPTIONS = /^English$/i;
const THEME_LIGHT_OPTIONS = /^(Light|淺色)$/i;
const THEME_DARK_OPTIONS = /^(Dark|深色)$/i;

async function openUserMenu(page: Page) {
  await page.getByTestId("user-menu-toggle-btn").click({
    timeout: 10000,
  });
}

async function selectDropdownOption(
  page: Page,
  dropdownTestId: string,
  optionPattern: RegExp
) {
  await page.getByTestId(dropdownTestId).click();
  await page.getByRole("option", { name: optionPattern }).first().click();
}

test.describe("Preferences I18n & Theme E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearAuth(page);
    await loginViaAPI(page, "student");
    await page.goto("/dashboard");
  });

  test("should switch UI language immediately and open docs from user menu", async ({
    page,
  }) => {
    await page.goto("/settings");
    await selectDropdownOption(
      page,
      "settings-language-dropdown",
      LANGUAGE_OPTIONS
    );

    await openUserMenu(page);
    const docsButton = page.getByTestId("user-menu-docs-btn");
    await expect(docsButton).toBeVisible();
    await expect(docsButton).toContainText("Documentation");
    await docsButton.click();
    await expect(page).toHaveURL(/\/docs/);
  });

  test("should switch theme without page refresh", async ({ page }) => {
    await page.goto("/settings");
    await selectDropdownOption(
      page,
      "settings-theme-dropdown",
      THEME_LIGHT_OPTIONS
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-carbon-theme",
      "white"
    );

    await selectDropdownOption(
      page,
      "settings-theme-dropdown",
      THEME_DARK_OPTIONS
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-carbon-theme",
      "g100"
    );
  });
});
