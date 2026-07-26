import { afterEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import type { DisplayDiagnostics } from "./displayCheckService";
import { DisplayCheckService } from "./displayCheckService";
import { MultiDisplayDetector } from "./multiDisplayDetector";

const flushChecks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("MultiDisplayDetector", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits once for a stable abnormal state and once when it recovers", async () => {
    let diagnostics: DisplayDiagnostics = {
      supportsScreenDetails: false,
      screenCount: null,
      isExtended: false,
      permissionState: null,
      errorMessage: null,
    };
    const displayService = {
      check: vi.fn(async () => diagnostics),
      checkExtendedSync: vi.fn(() => diagnostics.isExtended),
      getLastScreenDetails: vi.fn(() => null),
    } as unknown as DisplayCheckService;
    const detector = new MultiDisplayDetector(((key: string) => key) as TFunction, displayService);
    const onViolation = vi.fn();
    const onResolved = vi.fn();
    detector.onResolved(onResolved);
    detector.start(onViolation);
    await flushChecks();

    diagnostics = { ...diagnostics, isExtended: true };
    detector.triggerCheck();
    await flushChecks();
    detector.triggerCheck();
    await flushChecks();
    detector.triggerCheck();
    await flushChecks();
    expect(onViolation).toHaveBeenCalledTimes(1);
    expect(onViolation).toHaveBeenLastCalledWith(expect.objectContaining({
      eventType: "multiple_displays",
    }));

    diagnostics = { ...diagnostics, isExtended: false };
    detector.triggerCheck();
    await flushChecks();
    expect(onResolved).toHaveBeenCalledTimes(1);
    detector.triggerCheck();
    await flushChecks();
    expect(onResolved).toHaveBeenCalledTimes(1);

    detector.stop();
  });

  it("reports Display API degradation and recovery as health", async () => {
    let diagnostics: DisplayDiagnostics = {
      supportsScreenDetails: true,
      screenCount: null,
      isExtended: false,
      permissionState: null,
      errorMessage: "request failed",
    };
    const displayService = {
      check: vi.fn(async () => diagnostics),
      checkExtendedSync: vi.fn(() => false),
      getLastScreenDetails: vi.fn(() => null),
    } as unknown as DisplayCheckService;
    const detector = new MultiDisplayDetector(((key: string) => key) as TFunction, displayService);
    const onHealthChange = vi.fn();
    detector.onApiHealthChange(onHealthChange);
    detector.start(vi.fn());

    detector.triggerCheck();
    detector.triggerCheck();
    await flushChecks();
    expect(onHealthChange).toHaveBeenCalledWith("degraded", "request failed");

    diagnostics = { ...diagnostics, screenCount: 1, errorMessage: null };
    detector.triggerCheck();
    await flushChecks();
    expect(onHealthChange).toHaveBeenLastCalledWith("healthy", undefined);
    detector.stop();
  });
});
