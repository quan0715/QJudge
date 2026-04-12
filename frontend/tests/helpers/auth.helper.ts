/**
 * Authentication Helper Functions
 *
 * This file contains helper functions for authentication-related operations in E2E tests.
 */

import { Page, expect } from "@playwright/test";
import { API_ENDPOINTS, TEST_USERS } from "./data.helper";

export type UserRole = keyof typeof TEST_USERS;

/**
 * 考試進行中若 Redis 仍記錄 active session，學生再次 login 會 403 EXAM_LOGIN_BLOCKED。
 * 以教師身份清除該場考試的 session 後重試登入（E2E / 本機反覆跑測時需要）。
 */
async function tryRecoverExamLoginBlock(
  page: Page,
  role: UserRole,
  blockBody: Record<string, unknown>,
): Promise<boolean> {
  if (role !== "student" && role !== "student2") return false;
  const exam = blockBody.active_exam as Record<string, unknown> | undefined;
  const contestId = exam?.contest_id;
  if (contestId === undefined || contestId === null || contestId === "") return false;

  const tResp = await page.request.post(API_ENDPOINTS.auth.login, {
    data: {
      email: TEST_USERS.teacher.email,
      password: TEST_USERS.teacher.password,
    },
  });
  if (!tResp.ok()) return false;
  const tJson = (await tResp.json()) as Record<string, unknown>;
  const tToken = (tJson?.data as Record<string, unknown> | undefined)?.access_token as
    | string
    | undefined;
  if (!tToken) return false;
  const headers = { Authorization: `Bearer ${tToken}` };

  const pResp = await page.request.get(`/api/v1/contests/${contestId}/participants/`, {
    headers,
  });
  if (!pResp.ok()) return false;
  const pJson = (await pResp.json()) as Record<string, unknown> | unknown[];
  const list: Record<string, unknown>[] = Array.isArray(pJson)
    ? (pJson as Record<string, unknown>[])
    : ((pJson as { results?: Record<string, unknown>[] }).results ?? []);

  const want = TEST_USERS[role].username;
  const row = list.find((item) => item.username === want);
  const userId = row?.user_id;
  if (userId === undefined || userId === null) return false;

  // 僅 clear Redis 時，後端 `find_exam_conflict` 在 active session 為空仍會視為衝突而 403；
  // 須將考生狀態自進行中狀態拉回 `not_started` 才能恢復登入（E2E 中斷／殘留 in_progress）。
  const resetResp = await page.request.patch(
    `/api/v1/contests/${contestId}/update_participant/`,
    { headers, data: { user_id: Number(userId), exam_status: "not_started" } },
  );
  return resetResp.ok();
}

/** Carbon TextInput / PasswordInput forward `data-testid` to the real `<input>`. */
export async function fillAuthFormInput(page: Page, testId: string, value: string) {
  await page.getByTestId(testId).fill(value);
}

/**
 * Login helper function
 *
 * @param page - Playwright page object
 * @param role - User role (admin, teacher, student, student2)
 */
export async function login(page: Page, role: UserRole = "student") {
  const user = TEST_USERS[role];

  const gotoLogin = async () => {
    const isSameLoginRedirectInterrupt = (message: string) =>
      message.includes('interrupted by another navigation to "http://localhost:5174/login"') ||
      message.includes('interrupted by another navigation to "http://127.0.0.1:5174/login"') ||
      message.includes("interrupted by another navigation to \"/login\"");

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto("/login", {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
      } catch (error) {
        const message = String(error);
        // Harmless race in CI: app/router sometimes issues a concurrent redirect to the same /login URL.
        // Treat this as success after confirming we're on login (or already redirected away as authenticated).
        if (isSameLoginRedirectInterrupt(message)) {
          await page.waitForURL(/\/login|\/dashboard|\/problems|\/classrooms|\/$/, {
            timeout: 5000,
          }).catch(() => {});
          return;
        }
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
      page
        .getByTestId("auth-login-email")
        .waitFor({ state: "visible", timeout: 45000 })
        .then(() => true)
        .catch(() => false),
      page
        .waitForFunction(() => window.location.pathname !== "/login", undefined, {
          timeout: 45000,
        })
        .then(() => false)
        .catch(() => false),
    ]);

    if (!emailVisible) return; // Not visible, likely navigated away

    try {
      await fillAuthFormInput(page, "auth-login-email", user.email);
      await fillAuthFormInput(page, "auth-login-password", user.password);
      await page.getByTestId("auth-login-submit").click();
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
      .getByTestId("auth-form-error")
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
    .getByTestId("auth-form-error")
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
  await page.getByTestId("user-menu-toggle-btn").click({ timeout: 5000 });
  await page.getByTestId("user-menu-logout-request").click({ timeout: 5000 });
  const confirmBtn = page
    .getByTestId("user-menu-logout-modal")
    .getByRole("button")
    .filter({ has: page.getByTestId("user-menu-logout-confirm") });
  await confirmBtn.click({ timeout: 5000 });

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

  await fillAuthFormInput(page, "auth-register-username", username);
  await fillAuthFormInput(page, "auth-register-email", email);
  await fillAuthFormInput(page, "auth-register-password", password);
  await fillAuthFormInput(page, "auth-register-password-confirm", password);

  await page.getByTestId("auth-register-submit").click();

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
    await page.goto("/dashboard");
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });

    const path = new URL(page.url()).pathname;
    return path.startsWith("/dashboard");
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
  let response = await page.request.post("/api/v1/auth/email/login", {
    data: {
      email: user.email,
      password: user.password,
    },
  });
  let data: Record<string, unknown> | null = null;

  if (!response.ok()) {
    data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const conflictToken =
      data && typeof data.conflict_token === "string" ? data.conflict_token : "";
    const conflictCode = data && typeof data.code === "string" ? data.code : "";

    if (
      response.status() === 409 &&
      conflictCode === "EXAM_CONFLICT_ACTIVE_SESSION" &&
      conflictToken
    ) {
      response = await page.request.post("/api/v1/auth/resolve-conflict", {
        data: {
          conflict_token: conflictToken,
          action: "takeover_lock",
        },
      });
      data = null;
    } else if (response.status() === 403 && conflictCode === "EXAM_LOGIN_BLOCKED" && data) {
      const recovered = await tryRecoverExamLoginBlock(page, role, data);
      if (recovered) {
        response = await page.request.post("/api/v1/auth/email/login", {
          data: {
            email: user.email,
            password: user.password,
          },
        });
        data = null;
      }
    }
  }

  expect(response.ok()).toBeTruthy();
  const payload = data ?? ((await response.json()) as Record<string, unknown>);
  const dataNode = (payload?.data ?? {}) as Record<string, unknown>;
  const token = dataNode?.access_token as string | undefined;
  const userData = dataNode?.user;

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
