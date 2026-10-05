import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

const inbox = process.env.E2E_MAILPIT_URL || "http://127.0.0.1:8025";
const originalPassword = "Original-Recovery-Pass93!";
const newPassword = "Updated-Recovery-Pass64!";

// Synthetic credentials and links still need not appear in trace/video files.
test.use({ trace: "off", video: "off" });

async function receivedResetLink(request: APIRequestContext, email: string) {
  let messageId = "";
  await expect.poll(async () => {
    const response = await request.get(`${inbox}/api/v1/search`, {
      params: { query: `to:${email}` },
    });
    expect(response.ok()).toBe(true);
    const result = await response.json();
    messageId = result.messages[0]?.ID || "";
    return result.messages.length;
  }, { timeout: 30_000, message: "The Celery worker delivers a recovery email over SMTP" }).toBe(1);

  const response = await request.get(`${inbox}/api/v1/message/${messageId}`);
  expect(response.ok()).toBe(true);
  const message = await response.json();
  expect(message.From.Address).toBe("noreply@qjudge.test");
  expect(message.To.map((recipient: { Address: string }) => recipient.Address)).toEqual([email]);
  const match = message.Text.match(/https?:\/\/[^\s]+\/reset-password#token=[A-Za-z0-9_-]{43}/);
  expect(match, "Recovery email includes a fragment-only reset link").not.toBeNull();
  return new URL(match![0]);
}

test.describe("Password recovery", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      test(`recovery forms are reachable at ${viewport.width}px in ${colorScheme} mode`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        await page.goto("/forgot-password");
        await expect(page.locator("#reset-identifier")).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-carbon-theme", colorScheme === "dark" ? "g100" : "white");
        await page.getByRole("button", { name: "寄送重設連結" }).scrollIntoViewIfNeeded();
        await expect(page.getByRole("button", { name: "寄送重設連結" })).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath("forgot-password.png"), fullPage: true });

        // A synthetic token renders the form without generating any mail.
        await page.goto(`/reset-password#token=${"a".repeat(43)}`);
        await expect(page.locator("#reset-password")).toBeVisible();
        await expect(page.locator("#reset-confirmation")).toBeVisible();
        await page.getByRole("button", { name: "儲存密碼" }).scrollIntoViewIfNeeded();
        await expect(page.getByRole("button", { name: "儲存密碼" })).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath("reset-password.png"), fullPage: true });

        await page.goto("/reset-password#token=malformed");
        await expect(page.getByRole("alert")).toHaveText("連結無效或已過期。");
        await expect(page.getByRole("button", { name: "儲存密碼" })).toHaveCount(0);
      });
    }
  }

  test("receives worker mail, resets once and signs in with only the new password", async ({ page, request, baseURL }) => {
    const username = `recover_${randomUUID().replaceAll("-", "")}`;
    const email = `${username}@example.test`;
    const registered = await request.post("/api/v1/auth/register/password", {
      data: { username, email, password: originalPassword, password_confirm: originalPassword },
    });
    expect(registered.status()).toBe(201);

    await page.goto("/login");
    await page.locator('a[href="/forgot-password"]').click();
    await page.locator("#reset-identifier").fill(email);
    const requested = page.waitForResponse(response => response.url().endsWith("/auth/password/reset-requests"));
    await page.getByRole("button", { name: "寄送重設連結" }).click();
    const acknowledgement = await requested;
    expect(acknowledgement.status()).toBe(202);
    const genericResult = await acknowledgement.json();
    await expect(page.getByText("已收到申請", { exact: true })).toBeVisible();

    // Account existence must not change the request response or visible result.
    await page.goto("/forgot-password");
    await page.locator("#reset-identifier").fill(`unknown_${randomUUID()}@example.test`);
    const unknown = page.waitForResponse(response => response.url().endsWith("/auth/password/reset-requests"));
    await page.getByRole("button", { name: "寄送重設連結" }).click();
    const unknownResponse = await unknown;
    expect(unknownResponse.status()).toBe(202);
    expect(await unknownResponse.json()).toEqual(genericResult);
    await expect(page.getByText("已收到申請", { exact: true })).toBeVisible();

    const link = await receivedResetLink(request, email);
    expect(link.origin).toBe(new URL(baseURL!).origin);
    expect(link.search).toBe("");
    await page.goto(link.href);
    await page.locator("#reset-password").fill(newPassword);
    await page.locator("#reset-confirmation").fill("DifferentPassword93!");
    await page.getByRole("button", { name: "儲存密碼" }).click();
    await expect(page.getByRole("alert")).toHaveText("兩次密碼不一致。");

    await page.locator("#reset-password").fill("123");
    await page.locator("#reset-confirmation").fill("123");
    const weak = page.waitForResponse(response => response.url().includes("/auth/password/resets/"));
    await page.getByRole("button", { name: "儲存密碼" }).click();
    expect((await weak).status()).toBe(400);
    await expect(page.getByRole("alert")).toBeVisible();

    await page.locator("#reset-password").fill(newPassword);
    await page.locator("#reset-confirmation").fill(newPassword);
    await page.getByRole("button", { name: "儲存密碼" }).click();
    await expect(page.getByText("密碼已更新", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/reset-password$/);
    const cookieNames = (await page.context().cookies()).map(cookie => cookie.name);
    expect(cookieNames).not.toContain("access_token");
    expect(cookieNames).not.toContain("refresh_token");

    await page.getByRole("link", { name: "返回登入" }).click();
    await page.getByTestId("auth-login-email").fill(email);
    await page.getByTestId("auth-login-password").fill(originalPassword);
    await page.getByTestId("auth-login-submit").click();
    await expect(page.getByTestId("auth-form-error")).toBeVisible();
    await page.getByTestId("auth-login-password").fill(newPassword);
    await page.getByTestId("auth-login-submit").click();
    await expect(page).toHaveURL(/\/onboarding$/);
    const currentUser = await page.request.get("/api/v1/users/me");
    expect(currentUser.ok()).toBe(true);
    expect((await currentUser.json()).data.email).toBe(email);

    // A consumed link remains reachable while signed in, but cannot reset again.
    await page.goto(link.href);
    await page.locator("#reset-password").fill("Another-Recovery-Pass23!");
    await page.locator("#reset-confirmation").fill("Another-Recovery-Pass23!");
    const reused = page.waitForResponse(response => response.url().includes("/auth/password/resets/"));
    await page.getByRole("button", { name: "儲存密碼" }).click();
    const reusedResponse = await reused;
    expect(reusedResponse.status()).toBe(400);
    expect((await reusedResponse.json()).errors[0].code).toBe("invalid_reset_token");
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
