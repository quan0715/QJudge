/** Returns the themed portal container (inside <Theme> wrapper). Falls back to document.body. */
export const getModalPortalRoot = (): Element =>
  document.getElementById("modal-portal-root") ?? document.body;
