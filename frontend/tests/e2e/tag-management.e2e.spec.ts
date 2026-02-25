/**
 * E2E Tests for Tag Management
 *
 * Tests tag CRUD operations via API (permission enforcement).
 */

import { test, expect } from "@playwright/test";
import { loginViaAPI, clearAuth } from "../helpers/auth.helper";
import { TEST_USERS } from "../helpers/data.helper";

const TAG_API = "/api/v1/problems/tags/";

/**
 * Get a fresh admin token via raw API call.
 * This avoids issues with loginViaAPI clearing/resetting page state.
 */
async function getAdminToken(page: import("@playwright/test").Page) {
  const res = await page.request.post("/api/v1/auth/email/login", {
    data: {
      email: TEST_USERS.admin.email,
      password: TEST_USERS.admin.password,
    },
  });
  if (!res.ok()) return null;
  const body = await res.json();
  return (body?.data?.access_token as string) ?? null;
}

test.describe("Tag Management E2E Tests", () => {
  test.describe("Admin tag CRUD", () => {
    test("admin can create and delete a tag", async ({ page }) => {
      await page.goto("/");
      await clearAuth(page);
      await loginViaAPI(page, "admin");

      const tagName = `e2e-admin-${Date.now()}`;
      const token = await page.evaluate(() => localStorage.getItem("token"));

      // Create
      const createRes = await page.request.post(TAG_API, {
        data: { name: tagName, color: "#198038" },
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(createRes.status()).toBe(201);
      const tag = await createRes.json();
      expect(tag.slug).toBeTruthy();
      expect(tag.name).toBe(tagName);

      // Delete
      const delRes = await page.request.delete(`${TAG_API}${tag.slug}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(delRes.status()).toBe(204);
    });
  });

  test.describe("Teacher tag permissions", () => {
    test("teacher can create but cannot delete a tag", async ({ page }) => {
      await page.goto("/");
      await clearAuth(page);
      await loginViaAPI(page, "teacher");

      const tagName = `e2e-teacher-${Date.now()}`;
      const teacherToken = await page.evaluate(() =>
        localStorage.getItem("token")
      );

      // Create → 201
      const createRes = await page.request.post(TAG_API, {
        data: { name: tagName },
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(createRes.status()).toBe(201);
      const tag = await createRes.json();

      // Delete → 403
      const delRes = await page.request.delete(`${TAG_API}${tag.slug}/`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(delRes.status()).toBe(403);

      // Cleanup: get fresh admin token (no page navigation needed)
      const adminToken = await getAdminToken(page);
      if (adminToken) {
        await page.request.delete(`${TAG_API}${tag.slug}/`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      }
    });
  });

  test.describe("Student tag permissions", () => {
    test("student can list but cannot create tags", async ({ page }) => {
      await page.goto("/");
      await clearAuth(page);
      await loginViaAPI(page, "student");

      const token = await page.evaluate(() => localStorage.getItem("token"));

      // List → 200
      const listRes = await page.request.get(TAG_API, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(listRes.ok()).toBeTruthy();

      // Create → 403
      const createRes = await page.request.post(TAG_API, {
        data: { name: `e2e-student-${Date.now()}` },
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(createRes.status()).toBe(403);
    });
  });

  test.describe("Slug auto-generation", () => {
    test("slug is auto-generated from name", async ({ page }) => {
      await page.goto("/");
      await clearAuth(page);
      await loginViaAPI(page, "admin");

      const token = await page.evaluate(() => localStorage.getItem("token"));

      const createRes = await page.request.post(TAG_API, {
        data: { name: "Binary Search Tree" },
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(createRes.status()).toBe(201);
      const tag = await createRes.json();
      expect(tag.slug).toContain("binary-search-tree");

      // Cleanup
      await page.request.delete(`${TAG_API}${tag.slug}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    });
  });
});
