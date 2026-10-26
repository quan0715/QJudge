import { expect, test, type Locator, type Page } from "@playwright/test";

const fixture = "/tests/browser/fixtures/workbench-rail.html";
const row = (page: Page, key: string) => page.locator(`[data-row-key="${key}"]`);
const content = (page: Page, key: string) => row(page, key).getByRole("button", { name: /Prompt|Shared task/ });
const handle = (page: Page, key: string) => row(page, key).getByRole("button", { name: /拖曳排序/ });
const keys = (page: Page) => page.locator("[data-row-key]").evaluateAll((nodes) => nodes.slice(0, 5).map((node) => node.getAttribute("data-row-key")));

// CDP delivers trusted touch input, allowing Chromium's native pan arbitration.
// dispatchEvent(pointermove) alone cannot test native touch scrolling.
async function gesture(page: Page, source: Locator, dy: number, touch: boolean, cancel = false) {
  const box = await source.boundingBox();
  if (!box) throw new Error("Gesture target is not visible");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  else { await page.mouse.move(x, y); await page.mouse.down(); }
  for (let step = 1; step <= 12; step++) {
    const nextY = y + dy * step / 12;
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: nextY }] });
    else await page.mouse.move(x, nextY);
    await page.waitForTimeout(25); // Motion measures velocity/layout once per frame.
  }
  if (cdp) {
    await cdp.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else await page.mouse.up();
}

test("content swipes scroll without changing order or saving, including groups and locked papers", async ({ page, isMobile }) => {
  for (const locked of [false, true]) {
    await page.goto(`${fixture}${locked ? "?locked" : ""}`);
    const list = page.getByRole("navigation", { name: "題目" });
    const before = await keys(page);
    if (isMobile) {
      for (const key of ["q1", "g", "c1"]) {
        await list.evaluate((node) => { node.scrollTop = 0; });
        await gesture(page, content(page, key), -70, true);
        await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(30);
      }
    } else {
      await content(page, "q2").hover();
      await page.mouse.wheel(0, 200);
      await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(30);
      await list.evaluate((node) => { node.scrollTop = 0; });
      await gesture(page, content(page, "q1"), 120, false);
    }
    await expect(page.getByLabel("儲存次數")).toHaveText("0");
    expect(await keys(page)).toEqual(before);
  }
});

test("handles reorder a group and its children once per drop, without selecting", async ({ page, isMobile }) => {
  await page.goto(fixture);
  await gesture(page, handle(page, "g"), -65, isMobile);
  await expect(page.getByLabel("儲存次數")).toHaveText("1");
  expect(await keys(page)).toEqual(["g", "c1", "c2", "q1", "q2"]);
  await expect(page.getByLabel("選取題目")).toHaveText("q1");
  await gesture(page, handle(page, "c2"), -60, isMobile);
  await expect(page.getByLabel("儲存次數")).toHaveText("2");
  expect(await keys(page)).toEqual(["g", "c2", "c1", "q1", "q2"]);
  await expect(page.getByLabel("最後移動")).toHaveText(JSON.stringify({ id: "c2", target: { zone: "group", groupId: "g", refQuestionId: "c1", position: "before" } }));
  await content(page, "c1").click();
  await expect(page.getByLabel("選取題目")).toHaveText("c1");
});

test("keyboard selection and move buttons remain usable", async ({ page }) => {
  await page.goto(fixture);
  await content(page, "q1").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("選取題目")).toHaveText("q1");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "下移", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("儲存次數")).toHaveText("1");
  expect(await keys(page)).toEqual(["g", "c1", "c2", "q1", "q2"]);
  await content(page, "c2").focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("選取題目")).toHaveText("c2");
});

test("pending save blocks a second drag but leaves content scrollable", async ({ page, isMobile }) => {
  await page.goto(`${fixture}?pending&dark`);
  await gesture(page, handle(page, "q1"), 190, isMobile);
  await expect(page.getByLabel("儲存次數")).toHaveText("1");
  await expect(handle(page, "g")).toBeDisabled();
  const list = page.getByRole("navigation", { name: "題目" });
  if (isMobile) await gesture(page, content(page, "q2"), -140, true);
  else { await content(page, "q2").hover(); await page.mouse.wheel(0, 200); }
  await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(30);
  await expect(page.getByLabel("儲存次數")).toHaveText("1");
  await page.getByRole("button", { name: "完成合成儲存" }).click();
  await expect(handle(page, "g")).toBeEnabled();
});

test("touch cancellation restores order and allows repeated drag then selection", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Native touch cancellation uses the tablet project");
  await page.goto(fixture);
  const initialY = (await handle(page, "c2").boundingBox())!.y;
  for (let attempt = 0; attempt < 2; attempt++) {
    await gesture(page, handle(page, "c2"), -60, true, true);
    await expect(page.getByLabel("儲存次數")).toHaveText("0");
    await expect.poll(() => keys(page)).toEqual(["q1", "g", "c1", "c2", "q2"]);
    await expect.poll(async () => (await handle(page, "c2").boundingBox())!.y).toBeCloseTo(initialY, 0);
  }
  await gesture(page, handle(page, "c2"), -60, true);
  await expect(page.getByLabel("儲存次數")).toHaveText("1");
  await content(page, "c2").tap();
  await expect(page.getByLabel("選取題目")).toHaveText("c2");
});
