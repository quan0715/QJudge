import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  getClassrooms,
  createClassroom,
  getClassroom,
  addMembers,
  updateMemberRole,
} from "@/infrastructure/api/repositories/classroom.repository";
import { loginAndSetToken, setAuthToken, setupApiTestEnv } from "./helpers/apiTestEnv";
import { TEST_CLASSROOMS, TEST_USERS } from "@/tests/helpers/data.helper";

describe("classroom repository integration", () => {
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

  it("loads classroom list", async () => {
    const classrooms = await getClassrooms();
    const hasSeededClassroom = classrooms.some(
      (c) => c.name === TEST_CLASSROOMS.default.name
    );

    expect(Array.isArray(classrooms)).toBe(true);
    expect(hasSeededClassroom).toBe(true);
  });

  it("creates and retrieves a classroom", async () => {
    const name = `Integration Test Classroom ${Date.now()}`;
    const created = await createClassroom({ name, description: "Test Description" });
    
    expect(created.id).toBeDefined();
    expect(created.name).toBe(name);

    const detail = await getClassroom(created.id);
    expect(detail).toBeDefined();
    expect(detail?.name).toBe(name);
    expect(detail?.description).toBe("Test Description");
  });

  it("adds a member and updates role via update_member_role", async () => {
    const name = `Role API Test Classroom ${Date.now()}`;
    const created = await createClassroom({ name, description: "Role test" });
    expect(created.id).toBeDefined();

    await addMembers(created.id, [TEST_USERS.student.username]);

    const beforeTa = await getClassroom(created.id);
    const member = beforeTa?.members.find((m) => m.username === TEST_USERS.student.username);
    expect(member).toBeDefined();
    expect(member?.role).toBe("student");

    await updateMemberRole(created.id, member!.userId, "ta");

    const afterTa = await getClassroom(created.id);
    const memberAfter = afterTa?.members.find((m) => m.username === TEST_USERS.student.username);
    expect(memberAfter?.role).toBe("ta");

    await updateMemberRole(created.id, member!.userId, "student");

    const restored = await getClassroom(created.id);
    const memberRestored = restored?.members.find((m) => m.username === TEST_USERS.student.username);
    expect(memberRestored?.role).toBe("student");
  });
});
