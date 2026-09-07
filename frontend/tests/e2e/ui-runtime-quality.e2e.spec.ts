import { expect, test, type Page } from "@playwright/test";
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
  "/changelog",
] as const;

const retiredRoutes = [
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
    name: "desktop at 200% zoom equivalent",
    viewport: { width: 720, height: 900 },
    theme: "light",
  },
];

const protectedRoutes: Array<{
  expectedHeading?: RegExp;
  role: UserRole;
  route: string;
}> = [
  { role: "student", route: "/dashboard" },
  { role: "teacher", route: "/chat" },
  { role: "admin", route: "/system/users" },
  { role: "admin", route: "/management/announcements" },
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

async function expectHealthyLayout(page: Page) {
  await page.waitForFunction(
    () => (document.querySelector("#root")?.childElementCount ?? 0) > 0,
  );

  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = root.clientWidth;
    const viewportHeight = root.clientHeight;
    const documentWidth = Math.max(root.scrollWidth, body.scrollWidth);
    const documentScrollable =
      Math.max(root.scrollHeight, body.scrollHeight) > viewportHeight + 2;

    const largeNestedScrollOwners = Array.from(
      document.querySelectorAll<HTMLElement>("body *"),
    )
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          ["auto", "scroll"].includes(style.overflowY) &&
          element.scrollHeight > element.clientHeight + 2 &&
          rect.height >= Math.min(320, viewportHeight * 0.5) &&
          rect.width >= viewportWidth * 0.5
        );
      })
      .map((element) => ({
        className: element.className,
        id: element.id,
        tagName: element.tagName,
      }));

    return {
      documentScrollable,
      documentWidth,
      largeNestedScrollOwners,
      viewportWidth,
    };
  });

  expect(
    layout.documentWidth,
    `page width ${layout.documentWidth}px exceeds viewport ${layout.viewportWidth}px`,
  ).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(
    layout.documentScrollable && layout.largeNestedScrollOwners.length > 0,
    `document and large nested containers both scroll: ${JSON.stringify(layout.largeNestedScrollOwners)}`,
  ).toBe(false);
}

async function expectKeyboardFocus(page: Page) {
  await page.locator("body").press("Home");
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      height: rect.height,
      hasFocusIndicator:
        element.matches(":focus-visible") &&
        (style.outlineStyle !== "none" ||
          style.boxShadow !== "none" ||
          (style.borderTopStyle !== "none" &&
            Number.parseFloat(style.borderTopWidth) > 0)),
      tagName: element.tagName,
      width: rect.width,
    };
  });

  expect(focus, "Tab should move focus to a visible interactive element").not.toBeNull();
  expect(focus?.width ?? 0).toBeGreaterThan(0);
  expect(focus?.height ?? 0).toBeGreaterThan(0);
  expect(focus?.hasFocusIndicator, `${focus?.tagName} should expose a focus indicator`).toBe(
    true,
  );
}

for (const profile of profiles) {
  test.describe(profile.name, () => {
    test.use({
      colorScheme: profile.theme === "dark" ? "dark" : "light",
      viewport: profile.viewport,
    });

    for (const route of publicRoutes) {
      test(`${route} has one page scroll owner and no horizontal overflow`, async ({
        page,
      }) => {
        const runtimeErrors = await collectRuntimeErrors(page);
        await page.addInitScript((theme) => {
          localStorage.setItem("themePreference", theme);
        }, profile.theme);

        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(250);

        await expect(page.locator("html")).toHaveAttribute(
          "data-carbon-theme",
          profile.theme === "dark" ? "g100" : "white",
        );
        await expectHealthyLayout(page);
        await expectKeyboardFocus(page);
        expect(runtimeErrors, `runtime errors on ${route}`).toEqual([]);
      });
    }

    for (const { expectedHeading, role, route } of protectedRoutes) {
      test(`${role} ${route} has one page scroll owner and no horizontal overflow`, async ({
        page,
      }) => {
        await page.addInitScript((theme) => {
          localStorage.setItem("themePreference", theme);
        }, profile.theme);

        await loginViaAPI(page, role);
        const runtimeErrors = await collectRuntimeErrors(page);
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(250);

        await expect(page.locator("html")).toHaveAttribute(
          "data-carbon-theme",
          profile.theme === "dark" ? "g100" : "white",
        );
        await expect(
          page.getByText("伺服器錯誤 (503)"),
          "an unavailable optional AI service should not interrupt unrelated pages",
        ).toHaveCount(0);
        if (expectedHeading) {
          await expect(
            page.getByRole("heading", { name: expectedHeading }),
          ).toBeVisible();
        }
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
  await page.waitForTimeout(500);
  expect(aiRequests).toEqual([]);

  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await expect.poll(() => aiRequests.length).toBeGreaterThan(0);
});
