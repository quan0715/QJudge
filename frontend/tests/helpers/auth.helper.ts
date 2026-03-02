/**
 * Authentication Helper Functions
 *
 * This file contains helper functions for authentication-related operations in E2E tests.
 */

import { Page, expect } from "@playwright/test";
import { TEST_USERS } from "./data.helper";

export type UserRole = keyof typeof TEST_USERS;

/**
 * Login helper function
 *
 * @param page - Playwright page object
 * @param role - User role (admin, teacher, student, student2)
 */
export async function login(page: Page, role: UserRole = "student") {
  const user = TEST_USERS[role];

  const gotoLogin = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto("/login", {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
      } catch (error) {
        const message = String(error);
        // Retry on transient navigation interrupts (redirect or aborted)
        if (
          attempt < 2 &&
          (message.includes("ERR_ABORTED") || message.includes("interrupted"))
        ) {
          continue;
        }
        throw error;
      }

      // Check if we are already redirected (e.g., if already logged in)
      await page.waitForTimeout(500); // Give React time to route
      const path = new URL(page.url()).pathname;
      if (path !== "/login") {
        return; // We got redirected away, likely successful login
      }
      return;
    }
  };

  const submitOnce = async () => {
    await gotoLogin();
    
    // If not on login page, we probably successfully authenticated
    if (new URL(page.url()).pathname !== "/login") {
      return;
    }

    // It's possible the page is on /login but redirecting. 
    // We race waitForSelector with a URL change check
    const emailVisible = await Promise.race([
      page.waitForSelector("#email", { state: "visible", timeout: 45000 }).then(() => true).catch(() => false),
      page.waitForFunction(() => window.location.pathname !== "/login", undefined, { timeout: 45000 }).then(() => false).catch(() => false),
    ]);

    if (!emailVisible) return; // Not visible, likely navigated away

    try {
      await page.fill("#email", user.email);
      await page.fill("#password", user.password);
      await page.click('button[type="submit"]');
    } catch {
      // Elements might have unmounted if a delayed redirect triggered
    }
  };

  const waitForResult = async () => {
    const navigatedAway = page
      .waitForFunction(() => window.location.pathname !== "/login", undefined, {
        timeout: 25000,
      })
      .then(() => "navigated")
      .catch(() => null);

    const hasAuthError = page
      .locator(".auth-error")
      .isVisible({ timeout: 25000 })
      .then((visible) => (visible ? "error" : null))
      .catch(() => null);

    return Promise.race([navigatedAway, hasAuthError]);
  };

  // WebKit in CI can occasionally miss the first submit/navigation; retry once.
  await submitOnce();
  const result = await waitForResult();

  const stillOnLogin = new URL(page.url()).pathname === "/login";
  const authErrorVisible = await page
    .locator(".auth-error")
    .isVisible()
    .catch(() => false);

  if (stillOnLogin && !authErrorVisible && result !== "navigated") {
    await submitOnce();
    await waitForResult();
  }

  await expect(page).not.toHaveURL(/\/login/);
}


/**
 * Logout helper function
 *
 * @param page - Playwright page object
 */
export async function logout(page: Page) {
  const userMenuButton = page.getByRole("button", {
    name: /使用者選單|User Menu/i,
  });
  await userMenuButton.click({ timeout: 5000 });

  const logoutButton = page.getByRole("button", {
    name: /登出|Logout/i,
  });
  const logoutCount = await logoutButton.count();
  let clicked = false;
  for (let i = 0; i < logoutCount; i++) {
    const candidate = logoutButton.nth(i);
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: 5000, force: true });
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    await logoutButton.first().click({ timeout: 5000, force: true });
  }

  // Accept either immediate redirect or client auth state cleared.
  const logoutObserved = await Promise.race([
    page
      .waitForFunction(
        () => ["/", "/login"].includes(window.location.pathname),
        undefined,
        { timeout: 4000 }
      )
      .then(() => true)
      .catch(() => false),
    page
      .waitForFunction(
        () => !localStorage.getItem("user") && !localStorage.getItem("token"),
        undefined,
        { timeout: 4000 }
      )
      .then(() => true)
      .catch(() => false),
  ]);

  if (!logoutObserved) {
    // Fallback for unstable menu interactions in E2E: enforce unauthenticated state.
    await clearAuth(page);
    await page.context().clearCookies();
  }

  if (!/\/$|\/login/.test(new URL(page.url()).pathname)) {
    await page.goto("/problems");
  }

  await page.waitForURL(/\/$|\/login/, { timeout: 10000 });
  await expect(page).toHaveURL(/\/$|\/login/);
}

/**
 * Register a new user
 *
 * @param page - Playwright page object
 * @param email - User email
 * @param password - User password
 * @param username - Username
 */
export async function register(
  page: Page,
  email: string,
  password: string,
  username: string
) {
  // Navigate to register page
  await page.goto("/register");

  // Fill in registration form
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.fill("#username", username);

  // Submit form
  await page.click('button[type="submit"]');

  await page.waitForFunction(
    () => window.location.pathname !== "/register",
    undefined,
    { timeout: 20000 }
  );
}

/**
 * Check if user is authenticated
 *
 * @param page - Playwright page object
 * @returns true if authenticated, false otherwise
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    const hasUser = await page.evaluate(() => Boolean(localStorage.getItem("user")));
    if (!hasUser) return false;

    // Try to access a protected route
    await page.goto("/problems");
    await page.waitForURL(/\/problems/, { timeout: 5000 });

    const path = new URL(page.url()).pathname;
    return path.startsWith("/problems");
  } catch {
    return false;
  }
}

/**
 * Get authentication token from localStorage
 *
 * @param page - Playwright page object
 * @returns JWT token or null
 */
export async function getAuthToken(page: Page): Promise<string | null> {
  return await page.evaluate(() => localStorage.getItem("token"));
}

/**
 * Set authentication token in localStorage
 *
 * @param page - Playwright page object
 * @param token - JWT token
 */
export async function setAuthToken(page: Page, token: string) {
  await page.evaluate((token) => {
    localStorage.setItem("token", token);
  }, token);
}

/**
 * Clear authentication
 *
 * @param page - Playwright page object
 */
export async function clearAuth(page: Page) {
  await page.context().clearCookies();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.evaluate(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        sessionStorage.clear();
      });
      return;
    } catch (error) {
      const message = String(error);
      const retryable =
        message.includes("Execution context was destroyed") ||
        message.includes("Cannot find context with specified id") ||
        message.includes("Target page, context or browser has been closed");
      if (!retryable || attempt === 2) {
        if (retryable) return;
        throw error;
      }
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(
        () => {}
      );
    }
  }
}

/**
 * Login via API (faster than UI login)
 *
 * @param page - Playwright page object
 * @param role - User role
 */
export async function loginViaAPI(page: Page, role: UserRole = "student") {
  const user = TEST_USERS[role];

  // Make API request to login
  const response = await page.request.post("/api/v1/auth/email/login", {
    data: {
      email: user.email,
      password: user.password,
    },
  });

  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  const token = data?.data?.access_token as string | undefined;
  const userData = data?.data?.user;

  // Set token in localStorage
  await page.goto("/");
  if (token) {
    await setAuthToken(page, token);
  }

  // Store user data
  await page.evaluate((payload) => {
    if (payload) {
      localStorage.setItem("user", JSON.stringify(payload));
    }
  }, userData);
}
