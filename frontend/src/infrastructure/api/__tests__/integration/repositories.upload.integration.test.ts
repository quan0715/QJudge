import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { uploadAvatar } from "@/infrastructure/api/repositories/auth.repository";
import { uploadClassroomCover } from "@/infrastructure/api/repositories/classroom.repository";
import { uploadCover as uploadBankCover } from "@/infrastructure/api/repositories/questionBank.repository";
import {
  loginAndSetToken,
  setAuthToken,
  setupApiTestEnv,
  getApiBaseUrl,
} from "./helpers/apiTestEnv";
import { TEST_USERS } from "@/tests/helpers/data.helper";

/**
 * Minimal valid 1x1 PNG file bytes.
 */
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
  0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
  0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

const makePngFile = (name = "test.png") =>
  new File([pngBytes], name, { type: "image/png" });

/** Fetch a resource UUID from a list endpoint by matching a name field. */
async function fetchUuidByName(
  listPath: string,
  name: string,
  nameField = "name",
): Promise<string | null> {
  const baseUrl = getApiBaseUrl();
  const token = globalThis.localStorage?.getItem("token");
  const resp = await fetch(`${baseUrl}${listPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const body = await resp.json();
  const items = body.results ?? body;
  if (!Array.isArray(items)) return null;
  const match = items.find((item: Record<string, unknown>) => item[nameField] === name);
  return (match?.uuid as string) ?? null;
}

describe("Upload endpoints (multipart)", () => {
  let restoreFetch: (() => void) | undefined;

  beforeAll(async () => {
    const env = setupApiTestEnv();
    restoreFetch = env.restore;
    await loginAndSetToken({
      email: TEST_USERS.teacher.email,
      password: TEST_USERS.teacher.password,
    });
  });

  afterAll(() => {
    setAuthToken();
    restoreFetch?.();
  });

  /**
   * Regression: if FormData is JSON-stringified the backend returns 400
   * "file is required". With correct multipart, backend parses the file
   * then may fail at S3 (500) — which is acceptable in this test env.
   */
  it("uploadAvatar sends file as multipart FormData", async () => {
    const file = makePngFile();
    try {
      await uploadAvatar(file);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain("file is required");
      expect(msg).not.toContain("No file");
    }
  });

  it("uploadClassroomCover sends file as multipart FormData", async () => {
    const uuid = await fetchUuidByName("/api/v1/classrooms/", "E2E Test Classroom");
    if (!uuid) {
      console.warn("Skipping: E2E Test Classroom not seeded");
      return;
    }
    const file = makePngFile("cover.png");
    try {
      await uploadClassroomCover(uuid, file);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain("file is required");
      expect(msg).not.toContain("No file");
    }
  });

  it("uploadBankCover sends file as multipart FormData", async () => {
    const uuid = await fetchUuidByName("/api/v1/question-banks/", "E2E Test Bank");
    if (!uuid) {
      console.warn("Skipping: E2E Test Bank not seeded");
      return;
    }
    const file = makePngFile("cover.png");
    try {
      await uploadBankCover(uuid, file);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain("file is required");
      expect(msg).not.toContain("No file");
    }
  });
});
