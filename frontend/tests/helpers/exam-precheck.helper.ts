import { expect, type Page } from "@playwright/test";

export async function runPrecheckToAnswering(page: Page): Promise<void> {
  const step1Next = page.getByTestId("precheck-step1-next-btn");
  await expect(step1Next).toBeEnabled({ timeout: 10000 });
  await step1Next.click();

  const step2Primary = page.getByTestId("precheck-step2-primary-btn");
  await expect(step2Primary).toBeVisible({ timeout: 5000 });
  await step2Primary.click();

  const step2Next = page.getByTestId("precheck-step2-next-btn");
  await expect(step2Next).toBeVisible({ timeout: 15000 });
  await expect(step2Next).toBeEnabled({ timeout: 15000 });
  await step2Next.click();

  const startBtn = page.getByTestId("precheck-confirm-start-btn");
  await expect(startBtn).toBeVisible({ timeout: 10000 });
  await expect(startBtn).toBeEnabled({ timeout: 10000 });
  await startBtn.click();

  await page.waitForURL(/\/paper-exam\/answering/, { timeout: 20000 });
}

export async function gotoExamAnsweringThroughPrecheck(
  page: Page,
  contestId: string
): Promise<void> {
  await page.goto(`/contests/${contestId}/exam-precheck`);
  await page.waitForLoadState("networkidle");
  await runPrecheckToAnswering(page);
}
