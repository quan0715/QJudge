import { expect, test } from "@playwright/test";

test("keeps one header row with no overflow in every language and theme", async ({ page }, testInfo) => {
  for (const language of ["zh-TW", "en", "ja", "ko"]) {
    await page.goto(`/landing.html?lang=${language}`);
    const header = page.locator(".landing-header");
    await expect(header.getByRole("button")).toHaveCount(3);
    for (const theme of ["Light", "Dark"]) {
      await header.getByRole("button").nth(2).click();
      await page.getByRole("menuitemradio", { name: theme, exact: true }).click();
      const geometry = await header.evaluate((element) => {
        const brand = element.querySelector(".landing-header__brand")!.getBoundingClientRect();
        const nav = element.querySelector("nav")!.getBoundingClientRect();
        return {
          centerDifference: Math.abs(brand.top + brand.height / 2 - nav.top - nav.height / 2),
          right: nav.right,
          width: window.innerWidth,
          pageWidth: document.documentElement.scrollWidth,
        };
      });
      expect(geometry.centerDifference).toBeLessThan(1);
      expect(geometry.right).toBeLessThanOrEqual(geometry.width);
      expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.width);
    }
  }
  await page.screenshot({ path: testInfo.outputPath("landing-header.png") });
});

test("opens all dropdowns by keyboard, closes on Escape/outside click, and keeps links", async ({ page }) => {
  await page.goto("/landing.html?lang=en");
  const header = page.locator(".landing-header");
  for (let index = 0; index < 3; index++) {
    const trigger = header.getByRole("button").nth(index);
    await trigger.focus();
    const labelId = await trigger.getAttribute("aria-labelledby");
    const tooltip = page.locator(`[id="${labelId}"]`);
    await expect(tooltip).toBeVisible();
    const tooltipRect = await tooltip.boundingBox();
    expect(tooltipRect!.y).toBeGreaterThanOrEqual(0);
    await trigger.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const rect = await menu.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole("heading", { level: 1 }).click();
    await expect(menu).toHaveCount(0);
  }
  await header.getByRole("button").first().click();
  await expect(page.getByRole("menuitem")).toHaveCount(4);
  await expect(page.getByRole("menuitem").nth(0)).toHaveAttribute("href", "#landing-proposition");
  await expect(page.getByRole("menuitem").nth(1)).toHaveAttribute("href", "#landing-audience");
  await expect(page.getByRole("menuitem").nth(2)).toHaveAttribute("href", "#landing-faq");
  await expect(page.getByRole("menuitem", { name: "Sign in" })).toBeVisible();
});

test("switches language and theme without losing the selected state", async ({ page }) => {
  await page.goto("/landing.html?lang=en");
  const header = page.locator(".landing-header");
  await header.getByRole("button").nth(1).click();
  await expect(page.getByRole("menuitemradio")).toHaveCount(4);
  await expect(page.getByRole("menuitemradio", { name: "English" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: "日本語" }).press("Enter");
  await expect(page).toHaveURL(/lang=ja/);
  await expect(header.getByRole("button").nth(1)).toBeFocused();
  await header.getByRole("button").nth(1).click();
  await expect(page.getByRole("menuitemradio", { name: "日本語" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await header.getByRole("button").nth(2).click();
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).press("Enter");
  await expect(header.getByRole("button").nth(2)).toBeFocused();
  await header.getByRole("button").nth(2).click();
  await expect(page.getByRole("menuitemradio", { name: "Light", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("keeps automatic photos without playback buttons and respects reduced motion", async ({ page }) => {
  await page.goto("/landing.html?lang=en");
  const hero = page.getByTestId("landing-section-hero");
  await expect(hero.getByRole("button")).toHaveCount(2);
  await expect(hero.locator("img")).toHaveCount(2);
  const nextPhoto = hero.locator(".landing-hero-section__background--next");
  await expect(nextPhoto).toHaveCSS("animation-name", "landing-exam-photos");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(nextPhoto).toHaveCSS("animation-name", "none");
});
