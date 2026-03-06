import {
  isScreenExtended,
  type ScreenDetailsLike,
  type WindowWithScreenDetails,
} from "@/features/contest/domain/examMonitoringPolicy";

export interface DisplayDiagnostics {
  supportsScreenDetails: boolean;
  screenCount: number | null;
  isExtended: boolean;
  permissionState: string | null;
  errorMessage: string | null;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function getPermissionState(): Promise<string | null> {
  if (!navigator.permissions?.query) return null;
  try {
    const status = await navigator.permissions.query({
      name: "window-management" as PermissionName,
    });
    return status.state;
  } catch {
    return null;
  }
}

const DEFAULT_TIMEOUT_MS = 2500;

export class DisplayCheckService {
  private apiTimeoutMs: number;
  private lastScreenDetails: ScreenDetailsLike | null = null;

  constructor(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.apiTimeoutMs = timeoutMs;
  }

  async check(): Promise<DisplayDiagnostics> {
    const getScreenDetails = (window as WindowWithScreenDetails).getScreenDetails;
    const supportsScreenDetails = typeof getScreenDetails === "function";
    const permissionState = await withTimeout(
      getPermissionState(),
      this.apiTimeoutMs,
      "Permission query timeout",
    ).catch(() => null);
    const extended = isScreenExtended();

    if (!supportsScreenDetails) {
      return {
        supportsScreenDetails,
        screenCount: null,
        isExtended: extended,
        permissionState,
        errorMessage: "Screen Details API unavailable",
      };
    }

    try {
      const details = await withTimeout(
        getScreenDetails(),
        this.apiTimeoutMs,
        "getScreenDetails timeout",
      );
      this.lastScreenDetails = details;
      return {
        supportsScreenDetails,
        screenCount: Array.isArray(details?.screens) ? details.screens.length : null,
        isExtended: extended,
        permissionState,
        errorMessage: null,
      };
    } catch (error) {
      return {
        supportsScreenDetails,
        screenCount: null,
        isExtended: extended,
        permissionState,
        errorMessage:
          error instanceof Error ? error.message : "Failed to fetch screen details",
      };
    }
  }

  /** Synchronous fallback using screen.isExtended. */
  checkExtendedSync(): boolean {
    return isScreenExtended();
  }

  /** Returns the last ScreenDetails object (for attaching event listeners). */
  getLastScreenDetails(): ScreenDetailsLike | null {
    return this.lastScreenDetails;
  }
}
