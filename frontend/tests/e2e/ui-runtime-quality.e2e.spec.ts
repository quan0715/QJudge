import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginViaAPI, type UserRole } from "../helpers/auth.helper";

type RuntimeProfile = {
  name: string;
  viewport: { width: number; height: number };
  theme: "light" | "dark";
};

const publicRoutes = [
  "/",
  "/login",
  "/register",
  "/docs",
] as const;

const retiredRoutes = [
  { role: "teacher" as const, route: "/changelog" },
  { role: "admin" as const, route: "/management/announcements" },
  { role: "teacher" as const, route: "/marketplace" },
  { role: "teacher" as const, route: "/pricing" },
  { role: "admin" as const, route: "/system/review-queue" },
  {
    role: "student" as const,
    route: "/problems/00000000-0000-0000-0000-000000000000",
  },
  {
    role: "student" as const,
    route: "/problems/00000000-0000-0000-0000-000000000000/solve",
  },
];

const profiles: RuntimeProfile[] = [
  {
    name: "desktop light",
    viewport: { width: 1440, height: 900 },
    theme: "light",
  },
  {
    name: "mobile dark",
    viewport: { width: 390, height: 844 },
    theme: "dark",
  },
  {
    name: "narrow desktop",
    viewport: { width: 720, height: 900 },
    theme: "light",
  },
];

const protectedRoutes: Array<{
  role: UserRole;
  route: string;
}> = [
  { role: "student", route: "/dashboard" },
  { role: "teacher", route: "/chat" },
  { role: "admin", route: "/system/users" },
  { role: "admin", route: "/system/service-status" },
];

async function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource")
    ) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    const responseUrl = new URL(response.url());
    const isUnavailableOptionalAiService =
      response.status() === 503 &&
      responseUrl.pathname.startsWith("/api/v1/ai/");
    // The lean E2E stack intentionally omits the optional AI service. Its BFF
    // endpoints degrade to 503 while the rest of the product remains usable.
    if (isUnavailableOptionalAiService) return;
    if (response.status() >= 500) {
      errors.push(`response ${response.status()}: ${response.url()}`);
    }
  });
  return errors;
}

async function expectRouteContent(page: Page, route: string) {
  const expectedPath = route === "/docs" ? "/docs/overview" : route;
  await expect(page).toHaveURL((url) =>
    url.pathname === expectedPath ||
    (route === "/docs" && url.pathname === "/docs" && url.hash === "#/docs/overview"),
  );
  const contentByRoute: Record<string, Locator> = {
    "/": page.getByTestId("landing-section-hero"),
    "/login": page.getByTestId("auth-login-form"),
    "/register": page.getByTestId("auth-register-form"),
    "/docs": page.getByRole("main").getByRole("heading", { name: "平台概覽", level: 1 }),
    "/dashboard": page.getByRole("heading", { name: /歡迎回來/ }),
    "/chat": page.getByRole("textbox", { name: "訊息輸入" }),
    "/system/users": page.getByRole("heading", { name: "使用者管理", exact: true }),
    "/system/service-status": page.getByTestId("service-components"),
  };
  await expect(contentByRoute[route]).toBeVisible();
  await expect(page.getByRole("heading", { name: "頁面不存在" })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

async function expectHealthyLayout(page: Page) {
  const layout = await page.evaluate(() => ({
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(
    layout.documentWidth,
    `page width ${layout.documentWidth}px exceeds viewport ${layout.viewportWidth}px`,
  ).toBeLessThanOrEqual(layout.viewportWidth + 1);
  // Independent panes may scroll. A global scroll-owner count cannot tell
  // whether content is unreachable; cover that in the relevant workflow.
}

async function expectKeyboardFocus(page: Page) {
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  await expect(focused).toBeInViewport();
  // Presence of a border/box-shadow does not prove a visible focus indicator.
}

for (const profile of profiles) {
  test.describe(profile.name, () => {
    test.use({
      colorScheme: profile.theme === "dark" ? "dark" : "light",
      viewport: profile.viewport,
    });

    for (const route of publicRoutes) {
      test(`${route} loads its content without horizontal overflow`, async ({
        page,
      }) => {
        const runtimeErrors = await collectRuntimeErrors(page);
        await page.addInitScript((theme) => {
          localStorage.setItem("themePreference", theme);
        }, profile.theme);

        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expectRouteContent(page, route);

        await expect(page.locator("html")).toHaveAttribute(
          "data-carbon-theme",
          profile.theme === "dark" ? "g100" : "white",
        );
        await expectHealthyLayout(page);
        await expectKeyboardFocus(page);
        expect(runtimeErrors, `runtime errors on ${route}`).toEqual([]);
      });
    }

    for (const { role, route } of protectedRoutes) {
      test(`${role} ${route} loads its content without horizontal overflow`, async ({
        page,
      }) => {
        await page.addInitScript((theme) => {
          localStorage.setItem("themePreference", theme);
        }, profile.theme);

        await loginViaAPI(page, role);
        // Finish the setup document before observing errors on the target page.
        await page.goto("about:blank");
        const runtimeErrors = await collectRuntimeErrors(page);
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expectRouteContent(page, route);

        await expect(page.locator("html")).toHaveAttribute(
          "data-carbon-theme",
          profile.theme === "dark" ? "g100" : "white",
        );
        await expect(
          page.getByText("伺服器錯誤 (503)"),
          "an unavailable optional AI service should not interrupt unrelated pages",
        ).toHaveCount(0);
        await expectHealthyLayout(page);
        await expectKeyboardFocus(page);
        expect(runtimeErrors, `runtime errors on ${role} ${route}`).toEqual([]);
      });
    }
  });
}

for (const { role, route } of retiredRoutes) {
  test(`${route} uses the existing not-found page`, async ({ page }) => {
    await loginViaAPI(page, role);
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("404", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "頁面不存在" })).toBeVisible();
  });
}

test("closed user menu stays out of the keyboard order", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginViaAPI(page, "admin");
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  const toggle = page.getByTestId("user-menu-toggle-btn");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.focus();
  await page.keyboard.press("Tab");

  const closedFocus = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    const panel = document.querySelector("#user-menu-panel");
    const rect = element?.getBoundingClientRect();
    return {
      insideClosedPanel: Boolean(element && panel?.contains(element)),
      onScreen: Boolean(
        rect &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left >= 0 &&
          rect.right <= window.innerWidth,
      ),
    };
  });

  expect(closedFocus.insideClosedPanel).toBe(false);
  expect(closedFocus.onScreen).toBe(true);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("teacher Copilot APIs stay idle until a Copilot surface is requested", async ({
  page,
}) => {
  await loginViaAPI(page, "teacher");
  await page.evaluate(() => localStorage.removeItem("workspace_right_open"));
  const aiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1/ai/")) {
      aiRequests.push(request.url());
    }
  });

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expectRouteContent(page, "/dashboard");
  expect(aiRequests).toEqual([]);

  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await expect.poll(() => aiRequests.length).toBeGreaterThan(0);
});
