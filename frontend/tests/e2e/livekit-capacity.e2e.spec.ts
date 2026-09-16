import { expect, test } from "@playwright/test";

const enabled = process.env.QJUDGE_LIVEKIT_CAPACITY_ENABLED === "1";

const positiveInteger = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : 0;
};

test.describe("self-hosted LiveKit capacity", () => {
  test.skip(!enabled, "NOT_RUN: capacity testing requires an isolated deployed media host");

  test("requires an explicit dedicated Run and records the requested matrix", async (_fixtures, testInfo) => {
    const runId = process.env.QJUDGE_LIVEKIT_RUN_ID;
    const students = positiveInteger("QJUDGE_LIVEKIT_STUDENTS", 150);
    const proctors = positiveInteger("QJUDGE_LIVEKIT_PROCTORS", 5);
    const durationSeconds = positiveInteger("QJUDGE_LIVEKIT_DURATION_SECONDS", 1800);
    const shardIndex = Number(process.env.QJUDGE_LIVEKIT_SHARD_INDEX ?? 0);
    const shardCount = Number(process.env.QJUDGE_LIVEKIT_SHARD_COUNT ?? 1);

    expect(runId, "QJUDGE_LIVEKIT_RUN_ID is required for capacity runs").toBeTruthy();
    expect(students).toBeGreaterThanOrEqual(1);
    expect(proctors).toBeGreaterThanOrEqual(1);
    expect(durationSeconds).toBeGreaterThanOrEqual(60);
    expect(Number.isInteger(shardIndex) && shardIndex >= 0).toBeTruthy();
    expect(Number.isInteger(shardCount) && shardCount > shardIndex).toBeTruthy();

    // This guarded spec is intentionally fail-closed until a dedicated
    // browser runner supplies one real publisher identity per student and one
    // real selected subscriber per proctor. It must never turn synthetic HTTP
    // requests into a false media-capacity result.
    await testInfo.attach("capacity-plan", {
      body: JSON.stringify({ runId, students, proctors, durationSeconds, shardIndex, shardCount }),
      contentType: "application/json",
    });
    throw new Error("NOT_RUN: real browser publisher/subscriber runner is not configured");
  });
});
