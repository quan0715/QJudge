import { expect, test } from "@playwright/test";

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
