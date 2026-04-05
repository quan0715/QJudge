/**
 * E2E Tests for Authentication
 *
 * Tests login, registration, logout, and unauthorized access protection.
 * Locators: data-testid (+ Carbon nested input fill via fillAuthFormInput).
 * Note: NYCU SSO is not tested here as it requires external OAuth flow.
 */

import { test, expect } from "@playwright/test";
import {
  login,
  logout,
  loginViaAPI,
  clearAuth,
  isAuthenticated,
  fillAuthFormInput,
} from "../helpers/auth.helper";
import { TEST_USERS } from "../helpers/data.helper";

test.describe("Authentication E2E Tests", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await clearAuth(page);
  });

  test.describe("Registration", () => {
    test("should register a new user successfully", async ({ page }) => {
      const timestamp = Date.now();
      const newUser = {
        email: `testuser${timestamp}@example.com`,
        username: `testuser${timestamp}`,
        password: "TestPass123!",
      };

      await page.goto("/register");
      await expect(page).toHaveURL(/\/register/);
      await expect(page.getByTestId("auth-register-form")).toBeVisible();

      await fillAuthFormInput(page, "auth-register-username", newUser.username);
      await fillAuthFormInput(page, "auth-register-email", newUser.email);
      await fillAuthFormInput(page, "auth-register-password", newUser.password);
      await fillAuthFormInput(
        page,
        "auth-register-password-confirm",
        newUser.password,
      );

      await page.getByTestId("auth-register-submit").click();

      await page.waitForFunction(
        () => window.location.pathname !== "/register",
        undefined,
        { timeout: 20000 },
      );

      expect(page.url()).not.toContain("/register");
    });

    test("should show error when passwords do not match", async ({ page }) => {
      await page.goto("/register");

      await fillAuthFormInput(page, "auth-register-username", "testuser");
      await fillAuthFormInput(page, "auth-register-email", "test@example.com");
      await fillAuthFormInput(page, "auth-register-password", "Password123!");
      await fillAuthFormInput(
        page,
        "auth-register-password-confirm",
        "DifferentPassword123!",
      );

      await page.getByTestId("auth-register-submit").click();

      // Client-side validation: mismatch is on the confirm PasswordInput (`data-testid` is on `<input>`).
      await expect(page.getByTestId("auth-register-password-confirm")).toHaveAttribute(
        "aria-invalid",
        "true",
        { timeout: 5000 },
      );
      await expect(page).toHaveURL(/\/register/);
    });

    test("should show error when email already exists", async ({ page }) => {
      await page.goto("/register");

      await fillAuthFormInput(page, "auth-register-username", "newuser");
      await fillAuthFormInput(page, "auth-register-email", TEST_USERS.student.email);
      await fillAuthFormInput(page, "auth-register-password", "Password123!");
      await fillAuthFormInput(
        page,
        "auth-register-password-confirm",
        "Password123!",
      );

      await page.getByTestId("auth-register-submit").click();
      await page.waitForFunction(
        () => ["/register", "/error"].includes(window.location.pathname),
        undefined,
        { timeout: 5000 },
      );

      const path = new URL(page.url()).pathname;
      expect(path === "/register" || path === "/error").toBe(true);

      if (path === "/register") {
        await expect(page.getByTestId("auth-form-error")).toBeVisible({
          timeout: 5000,
        });
      }
    });
  });

  test.describe("Login", () => {
    test("should login as student successfully", async ({ page }) => {
      await login(page, "student");
      await expect(page).not.toHaveURL(/\/login/);
      expect(await isAuthenticated(page)).toBe(true);
    });

    test("should login as teacher successfully", async ({ page }) => {
      await login(page, "teacher");
      await expect(page).not.toHaveURL(/\/login/);
      expect(await isAuthenticated(page)).toBe(true);
    });

    test("should login as admin successfully", async ({ page }) => {
      await login(page, "admin");
      await expect(page).not.toHaveURL(/\/login/);
      expect(await isAuthenticated(page)).toBe(true);
    });

    test("should show error with invalid credentials", async ({ page }) => {
      await page.goto("/login");
      await fillAuthFormInput(page, "auth-login-email", "nonexistent@example.com");
      await fillAuthFormInput(page, "auth-login-password", "wrongpassword");
      await page.getByTestId("auth-login-submit").click();

      await expect(page.getByTestId("auth-form-error")).toBeVisible({
        timeout: 5000,
      });
      await expect(page).toHaveURL(/\/login/);
    });

    test("should show error with wrong password for existing user", async ({
      page,
    }) => {
      await page.goto("/login");
      await fillAuthFormInput(page, "auth-login-email", TEST_USERS.student.email);
      await fillAuthFormInput(page, "auth-login-password", "wrongpassword123");
      await page.getByTestId("auth-login-submit").click();

      await expect(page.getByTestId("auth-form-error")).toBeVisible({
        timeout: 5000,
      });
      await expect(page).toHaveURL(/\/login/);
    });

    test("should show error with empty fields", async ({ page }) => {
      await page.goto("/login");
      await page.getByTestId("auth-login-submit").click();
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("Logout", () => {
    test("should logout successfully", async ({ page }) => {
      await loginViaAPI(page, "teacher");
      await expect(page).not.toHaveURL(/\/login/);
      await page.goto("/dashboard");

      await logout(page);

      await expect(page).toHaveURL(/\/$|\/login/);
      expect(await isAuthenticated(page)).toBe(false);
    });
  });

  test.describe("Session Management", () => {
    test("should protect unauthorized access to dashboard", async ({
      page,
    }) => {
      await page.goto("/dashboard");
      await page.waitForURL(/\/$|\/login/, { timeout: 5000 });
      await expect(page).toHaveURL(/\/$|\/login/);
    });

    test("should maintain session after page reload", async ({ page }) => {
      await login(page, "student");
      await expect(page).not.toHaveURL(/\/login/);
      await page.reload();
      await expect(page).not.toHaveURL(/\/login/);
      expect(await isAuthenticated(page)).toBe(true);
    });

    test("should store user info in localStorage after login", async ({
      page,
    }) => {
      await login(page, "student");
      const user = await page.evaluate(() => localStorage.getItem("user"));
      expect(user).toBeTruthy();
      expect(user!).toContain(TEST_USERS.student.email);
    });

    test("should clear token from localStorage after logout", async ({
      page,
    }) => {
      await loginViaAPI(page, "teacher");
      await expect(page).not.toHaveURL(/\/login/);
      await page.goto("/dashboard");

      await logout(page);

      const token = await page.evaluate(() => localStorage.getItem("token"));
      expect(token).toBeFalsy();
    });
  });

  test.describe("Navigation", () => {
    test("should navigate from login to register page", async ({ page }) => {
      await page.goto("/login");
      await expect(page).toHaveURL(/\/login/);
      await page.getByTestId("auth-login-nav-register").click();
      await expect(page).toHaveURL(/\/register/);
    });

    test("should navigate from register to login page", async ({ page }) => {
      await page.goto("/register");
      await expect(page).toHaveURL(/\/register/);
      await page.getByTestId("auth-register-nav-login").click();
      await expect(page).toHaveURL(/\/login/);
    });

    test("should redirect to login when accessing protected route while not authenticated", async ({
      page,
    }) => {
      // Must match real routes under RequireAuth (not teacher-only / bare /classrooms, which 404).
      const protectedRoutes = ["/dashboard", "/problems", "/ranking"];

      for (const route of protectedRoutes) {
        await page.goto(route);
        await page.waitForURL(/\/$|\/login/, { timeout: 10000 });
      }
    });
  });
});
