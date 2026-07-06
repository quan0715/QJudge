/**
 * Pending Actions E2E Helpers
 *
 * Shared setup functions for pending action E2E tests.
 */
import { type Page } from "@playwright/test";
import { TEST_USERS } from "./data.helper";

export async function fillAndSubmitLoginForm(
  page: Page,
  role: keyof typeof TEST_USERS = "student",
): Promise<void> {
  const user = TEST_USERS[role];
  await page.getByTestId("auth-login-email").fill(user.email);
  await page.getByTestId("auth-login-password").fill(user.password);
  await page.getByTestId("auth-login-submit").click();
}

export async function registerFreshAccount(
  page: Page,
): Promise<{ email: string; password: string; username: string }> {
  const randomBytes = new Uint8Array(4);
  crypto.getRandomValues(randomBytes);
  const hex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const suffix = `${Date.now()}-${hex}`;
  const email = `e2e-test-${suffix}@example.com`;
  const username = `e2e_${suffix}`;
  const password = "TestPass123!";

  await page.getByTestId("auth-register-username").fill(username);
  await page.getByTestId("auth-register-email").fill(email);
  await page.getByTestId("auth-register-password").fill(password);
  await page.getByTestId("auth-register-password-confirm").fill(password);
  await page.getByTestId("auth-register-submit").click();

  return { email, password, username };
}

export async function getSessionStorageItem(
  page: Page,
  key: string,
): Promise<string | null> {
  return page.evaluate((k) => sessionStorage.getItem(k), key);
}
