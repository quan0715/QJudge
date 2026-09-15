/** How long submitting waits for queued monitoring data before going ahead. */
export const SUBMIT_UPLOAD_WAIT_MS = 15_000;

/**
 * Give queued monitoring uploads a bounded chance to finish before the exam is
 * submitted. Monitoring never blocks or fails a submission: whatever is still
 * queued afterwards keeps draining from the page while the server accepts it.
 */
export const flushUploadsForSubmit = async (
  flush: () => Promise<void>,
  waitMs = SUBMIT_UPLOAD_WAIT_MS,
): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      flush().catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
