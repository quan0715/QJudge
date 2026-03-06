import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DisplayCheckService } from "./displayCheckService";

describe("DisplayCheckService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window.screen, "isExtended", {
      value: false,
      configurable: true,
    });
    delete (window as { getScreenDetails?: unknown }).getScreenDetails;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns API unavailable when getScreenDetails is not present", async () => {
    const service = new DisplayCheckService();
    const diag = await service.check();

    expect(diag.supportsScreenDetails).toBe(false);
    expect(diag.screenCount).toBeNull();
    expect(diag.errorMessage).toBe("Screen Details API unavailable");
  });

  it("returns screen count when API is available", async () => {
    Object.defineProperty(window, "getScreenDetails", {
      configurable: true,
      value: vi.fn().mockResolvedValue({
        screens: [{ id: 1 }],
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    const service = new DisplayCheckService();
    const diag = await service.check();

    expect(diag.supportsScreenDetails).toBe(true);
    expect(diag.screenCount).toBe(1);
    expect(diag.errorMessage).toBeNull();
  });

  it("detects multiple screens", async () => {
    Object.defineProperty(window, "getScreenDetails", {
      configurable: true,
      value: vi.fn().mockResolvedValue({
        screens: [{ id: 1 }, { id: 2 }],
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    const service = new DisplayCheckService();
    const diag = await service.check();

    expect(diag.screenCount).toBe(2);
  });

  it("detects isExtended", async () => {
    Object.defineProperty(window.screen, "isExtended", {
      value: true,
      configurable: true,
    });

    const service = new DisplayCheckService();
    const diag = await service.check();

    expect(diag.isExtended).toBe(true);
  });

  it("handles getScreenDetails timeout", async () => {
    const neverResolve = new Promise<never>(() => {});
    Object.defineProperty(window, "getScreenDetails", {
      configurable: true,
      value: vi.fn().mockReturnValue(neverResolve),
    });

    const service = new DisplayCheckService(100);
    const promise = service.check();
    await vi.advanceTimersByTimeAsync(150);
    const diag = await promise;

    expect(diag.supportsScreenDetails).toBe(true);
    expect(diag.screenCount).toBeNull();
    expect(diag.errorMessage).toBe("getScreenDetails timeout");
  });

  it("handles getScreenDetails rejection", async () => {
    Object.defineProperty(window, "getScreenDetails", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("Permission denied")),
    });

    const service = new DisplayCheckService();
    const diag = await service.check();

    expect(diag.screenCount).toBeNull();
    expect(diag.errorMessage).toBe("Permission denied");
  });

  it("stores last screen details for event listener attachment", async () => {
    const mockDetails = {
      screens: [{ id: 1 }],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, "getScreenDetails", {
      configurable: true,
      value: vi.fn().mockResolvedValue(mockDetails),
    });

    const service = new DisplayCheckService();
    expect(service.getLastScreenDetails()).toBeNull();

    await service.check();
    expect(service.getLastScreenDetails()).toBe(mockDetails);
  });

  it("checkExtendedSync returns current isExtended value", () => {
    const service = new DisplayCheckService();
    expect(service.checkExtendedSync()).toBe(false);

    Object.defineProperty(window.screen, "isExtended", {
      value: true,
      configurable: true,
    });
    expect(service.checkExtendedSync()).toBe(true);
  });
});
