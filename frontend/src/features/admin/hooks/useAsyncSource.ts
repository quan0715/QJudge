import { useEffect, useState } from "react";

export type AsyncSource<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "failed" };

/**
 * Load one source once so a page can show each source on its own and let one fail
 * without blanking the rest. `load` must be a stable reference (a module-level
 * function); while `enabled` is false nothing is requested and the source stays
 * `loading`.
 */
export const useAsyncSource = <T>(load: () => Promise<T>, enabled = true): AsyncSource<T> => {
  const [source, setSource] = useState<AsyncSource<T>>({ status: "loading" });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setSource({ status: "ready", data });
      },
      () => {
        if (!cancelled) setSource({ status: "failed" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, enabled]);

  return source;
};
