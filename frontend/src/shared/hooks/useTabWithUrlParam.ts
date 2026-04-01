import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

interface UseTabWithUrlParamOptions<K extends string> {
  /** URL search param name (e.g. "tab", "panel") */
  param: string;
  /** Ordered list of valid tab keys */
  keys: readonly K[];
  /** Default key when param is absent or invalid (default: keys[0]) */
  defaultKey?: K;
  /** Legacy alias map: { oldKey: canonicalKey } */
  aliases?: Record<string, K>;
  /** If true, omit param from URL when value equals defaultKey (default: true) */
  omitDefault?: boolean;
}

interface UseTabWithUrlParamResult<K extends string> {
  /** Current active tab key (always valid) */
  activeKey: K;
  /** Current active tab index in keys array */
  activeIndex: number;
  /** Set active tab by key — updates URL */
  setActiveKey: (key: K) => void;
  /** Set active tab by index — updates URL (for Carbon Tabs onChange) */
  setActiveIndex: (index: number) => void;
}

function resolve<K extends string>(
  raw: string | null,
  keys: readonly K[],
  defaultKey: K,
  aliases?: Record<string, K>,
): K {
  if (!raw) return defaultKey;
  const normalized = aliases?.[raw] ?? raw;
  return keys.includes(normalized as K) ? (normalized as K) : defaultKey;
}

export function useTabWithUrlParam<K extends string>(
  options: UseTabWithUrlParamOptions<K>,
): UseTabWithUrlParamResult<K> {
  const {
    param,
    keys,
    defaultKey = keys[0],
    aliases,
    omitDefault = true,
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(param);
  const activeKey = resolve(raw, keys, defaultKey, aliases);
  const activeIndex = Math.max(0, keys.indexOf(activeKey));

  // Auto-normalize: if URL has alias or invalid value, rewrite silently
  const didNormalize = useRef(false);
  useEffect(() => {
    if (raw === null && activeKey === defaultKey) return; // no param, at default — fine
    const canonical = omitDefault && activeKey === defaultKey ? null : activeKey;
    const urlValue = raw ?? null;
    if (urlValue === canonical) return; // already canonical

    // Prevent infinite loop
    if (didNormalize.current) return;
    didNormalize.current = true;

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (canonical === null) {
          next.delete(param);
        } else {
          next.set(param, canonical);
        }
        return next;
      },
      { replace: true },
    );
  }, [raw, activeKey, defaultKey, omitDefault, param, setSearchParams]);

  // Reset normalization guard when raw changes
  useEffect(() => {
    didNormalize.current = false;
  }, [raw]);

  const setActiveKey = useCallback(
    (key: K) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (omitDefault && key === defaultKey) {
          next.delete(param);
        } else {
          next.set(param, key);
        }
        return next;
      });
    },
    [setSearchParams, param, defaultKey, omitDefault],
  );

  const setActiveIndex = useCallback(
    (index: number) => {
      const key = keys[index];
      if (key) setActiveKey(key);
    },
    [keys, setActiveKey],
  );

  return { activeKey, activeIndex, setActiveKey, setActiveIndex };
}
