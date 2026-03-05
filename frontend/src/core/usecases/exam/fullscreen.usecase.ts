type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element;
  msFullscreenElement?: Element;
  webkitExitFullscreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
};

type FullscreenElem = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
};

export const getFullscreenElement = (): Element | null => {
  const doc = document as FullscreenDoc;
  return (
    document.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.msFullscreenElement ??
    null
  );
};

export const isFullscreen = (): boolean => !!getFullscreenElement();

const waitForFullscreenState = async (
  expected: boolean,
  timeoutMs = 400,
  pollMs = 40
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isFullscreen() === expected) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return isFullscreen() === expected;
};

export const requestFullscreen = async (
  element: HTMLElement = document.documentElement,
): Promise<boolean> => {
  try {
    const elem = element as FullscreenElem;
    let requested = false;
    if (elem.requestFullscreen) {
      requested = true;
      await elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
      requested = true;
      await elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
      requested = true;
      await elem.msRequestFullscreen();
    }
    if (!requested) return false;
    return await waitForFullscreenState(true);
  } catch {
    return false;
  }
};

export const exitFullscreen = async (): Promise<boolean> => {
  try {
    if (!isFullscreen()) return true;

    const doc = document as FullscreenDoc;
    let exited = false;
    if (doc.exitFullscreen) {
      exited = true;
      await doc.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      exited = true;
      await doc.webkitExitFullscreen();
    } else if (doc.msExitFullscreen) {
      exited = true;
      await doc.msExitFullscreen();
    }
    if (!exited) return false;
    return await waitForFullscreenState(false);
  } catch {
    return false;
  }
};
