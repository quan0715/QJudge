import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { login } from "../helpers/auth.helper";
import { authHeadersWithDevice } from "../helpers/exam-lifecycle.helper";
import { gotoExamAnsweringThroughPrecheck } from "../helpers/exam-precheck.helper";

const enabled = process.env.QJUDGE_LIVEKIT_E2E_ENABLED === "1";
const configuredContestId = process.env.QJUDGE_LIVEKIT_CONTEST_ID;

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
          context.fillText(`LiveKit smoke ${Date.now()}`, 30, 60);
        };
        paint();
        const timer = window.setInterval(paint, 200);
        const stream = canvas.captureStream(5);
        window.addEventListener("pagehide", () => {
          window.clearInterval(timer);
          stream.getTracks().forEach((track) => track.stop());
        }, { once: true });
        return stream;
      },
    });
  });
}

async function json<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${new URL(response.url()).pathname}: ${response.status()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

test.describe("self-hosted LiveKit exam monitoring", () => {
  test.skip(!enabled, "NOT_RUN: requires a deployed LiveKit/TLS/TURN test environment");

  test("publishes an active exam scope and exposes the same Run to a proctor", async ({ browser }) => {
    test.skip(!configuredContestId, "QJUDGE_LIVEKIT_CONTEST_ID is required");
    const contestId = configuredContestId!;
    const studentContext = await browser.newContext();
    const teacherContext = await browser.newContext();
    const student = await studentContext.newPage();
    const teacher = await teacherContext.newPage();
    await installSyntheticScreen(student);

    try {
      await login(student, "student");
      await login(teacher, "teacher");
      await gotoExamAnsweringThroughPrecheck(student, contestId);

      const studentHeaders = await authHeadersWithDevice(student);
      const runtime = await json<{
        participant_id: number;
        integrity_run: { id: string };
        session_identity: { attempt_id: string; device_id: string };
      }>(await student.request.get(`/api/v1/contests/${contestId}/exam/runtime-state/`, {
        headers: studentHeaders,
      }));
      const config = await json<{ enabled: boolean; configured: boolean; provider: string }>(
        await student.request.get(`/api/v1/contests/${contestId}/exam/live/config/`, {
          headers: studentHeaders,
        }),
      );
      expect(config).toEqual({ enabled: true, configured: true, provider: "livekit" });

      const tokenResponse = await student.request.post(`/api/v1/contests/${contestId}/exam/live/token/`, {
        headers: studentHeaders,
        data: {
          role: "publisher",
          upload_scope: {
            run_id: runtime.integrity_run.id,
            participant_id: runtime.participant_id,
            attempt_id: runtime.session_identity.attempt_id,
            device_id: runtime.session_identity.device_id,
          },
        },
      });
      expect(tokenResponse.ok()).toBeTruthy();
      expect(tokenResponse.headers()["cache-control"]).toContain("no-store");
      const publisher = await tokenResponse.json();
      expect(publisher.run_id).toBe(runtime.integrity_run.id);
      expect(publisher.role).toBe("publisher");
      expect(publisher.token).toBeTruthy();

      const teacherHeaders = await authHeadersWithDevice(teacher);
      const targets = await json<{ observed_at: string | null; stale: boolean; targets: unknown[] }>(
        await teacher.request.get(`/api/v1/contests/${contestId}/exam/live/targets/`, {
          headers: teacherHeaders,
        }),
      );
      expect(targets).toHaveProperty("stale");
      expect(targets).toHaveProperty("targets");
    } finally {
      await studentContext.close();
      await teacherContext.close();
    }
  });
});
