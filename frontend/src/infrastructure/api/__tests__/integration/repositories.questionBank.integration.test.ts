import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  getQuestionBanks,
  create,
  getBank,
} from "@/infrastructure/api/repositories/questionBank.repository";
import { loginAndSetToken, setAuthToken, setupApiTestEnv } from "./helpers/apiTestEnv";
import { TEST_QUESTION_BANKS, TEST_USERS } from "@/tests/helpers/data.helper";

describe("question bank repository integration", () => {
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

  it("loads question bank list", async () => {
    const banks = await getQuestionBanks();
    const hasSeededBank = banks.some(
      (b) => b.name === TEST_QUESTION_BANKS.default.name
    );

    expect(Array.isArray(banks)).toBe(true);
    expect(hasSeededBank).toBe(true);
  });

  it("creates and retrieves a question bank", async () => {
    const name = `Integration Test Bank ${Date.now()}`;
    const created = await create({ 
      name, 
      description: "Test Description",
      category: "coding",
      visibility: "private"
    });
    
    expect(created.id).toBeDefined();
    expect(created.name).toBe(name);

    const detail = await getBank(created.id);
    expect(detail).toBeDefined();
    expect(detail?.name).toBe(name);
    expect(detail?.category).toBe("coding");
  });
});
