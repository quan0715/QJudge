import { expect, test } from "@playwright/test";

test("mode switch shares the top action bar and remembers the multiple-view size", async ({ page }) => {
  // The full panel imports the admin feature graph on a cold Vite server.
  test.setTimeout(60_000);
  await page.goto("/tests/browser/fixtures/proctor-grid.html?panel");
  const toggle = page.getByRole("switch", { name: /多人|Multiple/ });
  const count = page.getByRole("combobox", { name: /每頁監看人數|Students per page/ });
  await expect(toggle).toBeChecked({ timeout: 30_000 });
  await count.selectOption("9");
  const toggleBox = await toggle.boundingBox();
  const headingBox = await page.getByRole("heading", { name: /監考|Proctor/ }).boundingBox();
  expect(Math.abs(toggleBox!.y - headingBox!.y)).toBeLessThan(30);
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).not.toBeChecked();
  await expect(count).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(count).toHaveValue("9");
  await expect(page.getByRole("button", { name: /重新整理|Refresh/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /重新連線|Reconnect/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("toolbar.png") });
});

for (const size of [4, 9]) {
  test(`${size}-person grid fills active slots and keeps webcam inside its student tile`, async ({ page }) => {
    await page.goto(`/tests/browser/fixtures/proctor-grid.html?size=${size}`);
    const tiles = page.getByRole("button", { name: /Student/ });
    await expect(tiles).toHaveCount(size);
    await expect(page.getByRole("button", { name: /Student 00/ })).toHaveCount(0);
    const tile = tiles.first();
    await expect(tile.locator("video")).toHaveCount(2);
    await expect.poll(() => tile.locator("video").evaluateAll(videos =>
      videos.every(video => (video as HTMLVideoElement).videoWidth > 0))).toBe(true);
    const screen = await tile.boundingBox();
    const webcam = await tile.locator("video").nth(1).boundingBox();
    expect(webcam!.x).toBeGreaterThan(screen!.x);
    expect(webcam!.x + webcam!.width).toBeLessThanOrEqual(screen!.x + screen!.width);
    expect(webcam!.y + webcam!.height).toBeLessThanOrEqual(screen!.y + screen!.height);
    await page.screenshot({ path: test.info().outputPath("grid.png") });
    await page.getByRole("button", { name: /下一頁|Next page/ }).click();
    await expect(tiles).toHaveCount(Math.min(size, 10 - size));
    await page.getByRole("button", { name: "Toggle sharing" }).click();
    await expect(tiles).toHaveCount(0);
    await page.getByRole("button", { name: "Toggle sharing" }).click();
    await expect(tiles).toHaveCount(Math.min(size, 10 - size));
  });
}
