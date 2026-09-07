import { test, expect, type APIResponse, type Page } from "@playwright/test";
import { loginViaAPI, setAuthToken } from "../helpers/auth.helper";
import { API_ENDPOINTS } from "../helpers/data.helper";
import {
  addClassroomStudentMembers,
  authHeaders,
  authHeadersWithDevice,
  getContestExamStatus,
  getMyUserId,
  submitPaperExamFromAnswering,
} from "../helpers/exam-lifecycle.helper";
import { gotoExamAnsweringThroughPrecheck } from "../helpers/exam-precheck.helper";

// Integration boundary: replace only the OS display picker with a synthetic,
// changing canvas track. MediaRecorder, OPFS, IndexedDB, checkpoint delivery,
// resident processing and backend event projection are real. This is NOT proof
// of real monitor permission/capture support. No Worker controls or legacy path.
async function installSyntheticScreen(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext("2d")!;
        const paint = () => {
          context.fillStyle = "#16324f";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = "white";
          context.font = "32px sans-serif";
          context.fillText(`Synthetic E2E monitor ${Date.now()}`, 30, 60);
        };
        paint();
        const timer = window.setInterval(paint, 200);
        const stream = canvas.captureStream(5);
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings.bind(track);
        Object.defineProperty(track, "getSettings", {
          value: () => ({ ...settings(), displaySurface: "monitor" }),
        });
        window.addEventListener("pagehide", () => {
          window.clearInterval(timer);
          stream.getTracks().forEach((item) => item.stop());
        }, { once: true });
        return stream;
      },
    });
  });
}

async function json<T>(response: APIResponse): Promise<T> {
  // Do not dump responses containing tokens or evidence URLs into test output.
  expect(response.ok(), `${new URL(response.url()).pathname}: ${response.status()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

type ProjectedEvent = { id: string; user: number; event_type: string; penalized: boolean; metadata: { source?: string } };

test("resident monitored paper exam survives checkpoint outage and resets to a new attempt", async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const teacherContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const studentContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const teacher = await teacherContext.newPage();
  const student = await studentContext.newPage();
  await installSyntheticScreen(student);

  try {
    await loginViaAPI(teacher, "teacher");
    // A failed monitored attempt intentionally blocks cross-device login.
    // Register an isolated student instead of resetting another run's records.
    const username = `resident_${Date.now()}_${testInfo.workerIndex}`;
    const password = `Resident-E2E-${crypto.randomUUID()}`;
    const registered = await json<{ data: { access_token: string; user: unknown } }>(await student.request.post(API_ENDPOINTS.auth.register, {
      data: { username, email: `${username}@example.com`, password, password_confirm: password },
    }));
    const registrationHeaders = { Authorization: `Bearer ${registered.data.access_token}` };
    await json(await student.request.patch("/api/v1/users/me/preferences", {
      headers: registrationHeaders, data: { display_name: username, onboarding_completed_at: new Date().toISOString() },
    }));
    const currentStudent = await json<{ data: unknown }>(await student.request.get(API_ENDPOINTS.users.me, { headers: registrationHeaders }));
    await student.goto("/", { waitUntil: "domcontentloaded" });
    await setAuthToken(student, registered.data.access_token);
    await student.evaluate((user) => localStorage.setItem("user", JSON.stringify(user)), currentStudent.data);
    const teacherHeaders = await authHeaders(teacher);
    const studentHeaders = await authHeadersWithDevice(student);
    const studentId = await getMyUserId(student);
    const label = `Resident E2E ${Date.now()}-${testInfo.workerIndex}`;
    const classroom = await json<{ uuid: string }>(await teacher.request.post("/api/v1/classrooms/", {
      headers: teacherHeaders, data: { name: label, description: "Dedicated resident integration fixture" },
    }));
    expect(classroom.uuid).toBeTruthy();
    await addClassroomStudentMembers(teacher, classroom.uuid, [username]);
    const created = await json<{ contest_id: string }>(await teacher.request.post(`/api/v1/classrooms/${classroom.uuid}/contests/`, {
      headers: teacherHeaders,
      data: { name: label, contest_type: "paper_exam", cheat_detection_enabled: true, attendance_check_enabled: false },
    }));
    const contestId = created.contest_id;
    expect(contestId).toBeTruthy();
    const contestPath = API_ENDPOINTS.contests.detail(contestId);
    const question = await json<{ id: string }>(await teacher.request.post(`/api/v1/contests/${contestId}/exam-questions/`, {
      headers: teacherHeaders,
      data: { question_type: "short_answer", prompt: "Describe why answers must survive monitoring outages.", correct_answer: "student safety", score: 5 },
    }));
    const startsAt = Date.now() + 15_000;
    const endsAt = startsAt + 20 * 60_000;
    const detectors = { pwa_mode: false, fullscreen: false, multi_display: false, mouse_leave: false, viewport_integrity: false };
    await json(await teacher.request.patch(contestPath, {
      headers: teacherHeaders,
      data: {
        status: "published", start_time: new Date(startsAt).toISOString(), end_time: new Date(endsAt).toISOString(),
        cheat_detection_enabled: true,
        anticheat_device_policy: {
          desktop: { enabled: true, sources: { screen_share: { enabled: true }, webcam: { enabled: false } }, detectors },
          tablet: { enabled: false, sources: { screen_share: { enabled: false }, webcam: { enabled: false } }, detectors },
        },
      },
    }));
    // Keep unique fixtures for failed-run inspection; never reset shared exams.
    await testInfo.attach("resident-fixture", { body: JSON.stringify({ classroomId: classroom.uuid, contestId, startsAt }), contentType: "application/json" });
    // The normal entry API establishes classroom membership participation and
    // is idempotent if publication already enrolled the classroom's students.
    await json(await student.request.post(`/api/v1/contests/${contestId}/enter/`, { headers: studentHeaders }));
    await expect.poll(() => Date.now() >= startsAt, { timeout: 20_000 }).toBe(true);

    const checkpointPath = `/api/v1/contests/${contestId}/exam/integrity/checkpoints/`;
    const isCheckpoint = (url: URL) => url.pathname === checkpointPath;
    const attempts = new Set<string>();
    const completedAttempts = new Set<string>();
    student.on("response", async (response) => {
      if (!isCheckpoint(new URL(response.url())) || !response.ok()) return;
      try {
        const scope = response.request().postDataJSON()?.upload_scope;
        const body = await response.json();
        if (scope?.attempt_id) {
          attempts.add(scope.attempt_id);
          if (body.upload_status === "complete") completedAttempts.add(scope.attempt_id);
        }
      } catch { /* A canceled response during navigation is not an ACK. */ }
    });
    const studentEvents = async () => {
      const body = await json<{ events: ProjectedEvent[] }>(await teacher.request.get(`/api/v1/contests/${contestId}/exam/events/`, { headers: teacherHeaders }));
      return body.events.filter((event) => String(event.user) === studentId);
    };
    const clipboardEvents = async () => (await studentEvents()).filter((event) => event.event_type === "clipboard_action");
    const savedAnswer = async () => {
      const answers = await json<Array<{ question_id: string; answer: { text?: string } }>>(await student.request.get(`/api/v1/contests/${contestId}/exam-answers/my-answers/`, { headers: studentHeaders }));
      return answers.find((answer) => String(answer.question_id) === String(question.id))?.answer.text;
    };
    const copyAnswer = async () => {
      const input = student.getByTestId(`exam-answer-input-${question.id}`);
      await input.focus();
      await input.press("ControlOrMeta+A");
      await input.press("ControlOrMeta+C");
    };

    await gotoExamAnsweringThroughPrecheck(student, contestId);
    const input = student.getByTestId(`exam-answer-input-${question.id}`);
    const firstAnswer = "Student answers remain independent of monitoring delivery.";
    await input.fill(firstAnswer);
    await input.blur();
    await expect.poll(savedAnswer, { timeout: 20_000 }).toBe(firstAnswer);
    await copyAnswer();
    await expect.poll(async () => (await clipboardEvents()).length, { timeout: 45_000 }).toBeGreaterThan(0);
    const firstEventIds = new Set((await clipboardEvents()).map((event) => event.id));
    await expect.poll(() => attempts.size, { timeout: 20_000 }).toBe(1);
    const firstAttempt = [...attempts][0];

    await json(await teacher.request.patch(contestPath, { headers: teacherHeaders, data: { end_time: new Date(endsAt + 10 * 60_000).toISOString() } }));
    await expect(input).toHaveValue(firstAnswer);
    await expect.poll(savedAnswer).toBe(firstAnswer);

    let blockedCheckpoints = 0;
    await student.route(isCheckpoint, async (route) => {
      blockedCheckpoints += 1;
      await route.abort("connectionfailed");
    });
    await expect.poll(() => blockedCheckpoints, { timeout: 20_000 }).toBeGreaterThan(0);
    const finalAnswer = `${firstAnswer} Saved and submitted during an outage.`;
    await input.fill(finalAnswer);
    await input.blur();
    await expect.poll(savedAnswer, { timeout: 20_000 }).toBe(finalAnswer);
    await submitPaperExamFromAnswering(student, contestId);
    await expect.poll(() => getContestExamStatus(student, contestId)).toBe("submitted");
    await expect.poll(savedAnswer).toBe(finalAnswer);
    await student.unroute(isCheckpoint);
    await expect.poll(() => completedAttempts.has(firstAttempt), { timeout: 90_000 }).toBe(true);
    const previousEventIds = new Set((await studentEvents()).map((event) => event.id));

    await json(await teacher.request.post(`/api/v1/contests/${contestId}/participants/reset_exam_record/`, {
      headers: teacherHeaders, data: { user_id: Number(studentId) },
    }));
    await gotoExamAnsweringThroughPrecheck(student, contestId);
    await expect.poll(async () => (await studentEvents()).some((event) =>
      event.event_type === "exam_entered" && !previousEventIds.has(event.id)), { timeout: 45_000 }).toBe(true);
    await expect.poll(() => getContestExamStatus(student, contestId)).toBe("in_progress");
    expect((await studentEvents()).filter((event) => !previousEventIds.has(event.id) && event.penalized)).toEqual([]);
    await expect(input).toHaveValue("");
    await input.fill("A genuinely new attempt after explicit teacher reset.");
    await copyAnswer();
    await expect.poll(async () => (await clipboardEvents()).some((event) => !firstEventIds.has(event.id)), { timeout: 45_000 }).toBe(true);
    await expect.poll(() => [...attempts].some((attempt) => attempt !== firstAttempt), { timeout: 20_000 }).toBe(true);
    // Finish the second attempt too, so this test leaves no student mid-exam.
    await input.blur();
    await submitPaperExamFromAnswering(student, contestId);
    await expect.poll(() => getContestExamStatus(student, contestId)).toBe("submitted");
    await expect.poll(() => [...attempts].filter((attempt) => attempt !== firstAttempt).every((attempt) => completedAttempts.has(attempt)), { timeout: 90_000 }).toBe(true);
    // Clipboard is intentionally auditable/penalized under the frozen policy.
    // It must not resurrect the previous attempt's connectivity deadline.
    expect((await studentEvents()).filter((event) => !previousEventIds.has(event.id) &&
      event.event_type === "connectivity_timeout" && event.penalized)).toEqual([]);
  } catch (error) {
    // These isolated contexts are not the built-in page fixture, so retain the
    // concrete student UI explicitly when a lifecycle assertion fails.
    if (!student.isClosed()) {
      await testInfo.attach("student-failure", { body: await student.screenshot(), contentType: "image/png" });
      await testInfo.attach("student-ui", { body: await student.locator("body").ariaSnapshot(), contentType: "text/plain" });
    }
    throw error;
  } finally {
    await studentContext.close();
    await teacherContext.close();
  }
});
