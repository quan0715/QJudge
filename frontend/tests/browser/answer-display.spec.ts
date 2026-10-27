import { expect, test } from "@playwright/test";

test("plain-text answers retain symbols, indentation, blank lines, and safe wrapping", async ({ page }, testInfo) => {
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.goto("/tests/browser/fixtures/answer-display.html");
  const answer = page.getByRole("region", { name: "作答內容" });
  await expect(answer).toBeVisible();

  const layout = await answer.evaluate((element) => {
    const content = element.lastElementChild!.firstElementChild!;
    const text = content.firstChild!;
    function characterPosition(index: number) {
      const range = document.createRange();
      range.setStart(text, index);
      range.setEnd(text, index + 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    }
    return {
      text: content.textContent,
      first: characterPosition(0),
      indented: characterPosition(content.textContent!.indexOf("cout")),
      afterBlank: characterPosition(content.textContent!.indexOf("a*=2")),
      lineHeight: parseFloat(getComputedStyle(content).lineHeight),
      overflows: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

  expect(layout.text).toContain('a * b * c; *value*\n    cout << "< >";\n\na*=2; i++; j=i;');
  expect(layout.text).toContain('<span style="color:red">literal</span><script>alert(1)</script>');
  expect(await answer.locator("em, strong, code, span, script").count()).toBe(0);
  expect(dialogs).toEqual([]);
  expect(layout.indented.x).toBeGreaterThan(layout.first.x + 10);
  expect(layout.afterBlank.y - layout.indented.y).toBeGreaterThanOrEqual(layout.lineHeight * 1.9);
  expect(layout.overflows).toBe(false);
  await expect(page.getByRole("region", { name: "參考答案" }).locator("strong")).toHaveText("Reference stays bold");
  await page.screenshot({ path: testInfo.outputPath("plain-text-answer.png"), fullPage: true });
});
