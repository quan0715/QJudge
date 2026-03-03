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

export const requestFullscreen = async (
  element: HTMLElement = document.documentElement,
): Promise<boolean> => {
  try {
    const elem = element as FullscreenElem;
    if (elem.requestFullscreen) {
      await elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
      await elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
      await elem.msRequestFullscreen();
    }
    return true;
  } catch {
    return false;
  }
};

export const exitFullscreen = async (): Promise<boolean> => {
  try {
    if (!isFullscreen()) return true;

    const doc = document as FullscreenDoc;
    if (doc.exitFullscreen) {
      await doc.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    } else if (doc.msExitFullscreen) {
      await doc.msExitFullscreen();
    }
    return true;
  } catch {
    return false;
  }
};
