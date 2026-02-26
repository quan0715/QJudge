/**
 * Build a URL query string from a params object.
 *
 * - Skips `null` / `undefined` values
 * - Arrays are appended as repeated keys (e.g. `difficulty=easy&difficulty=hard`)
 * - All other values are coerced to string
 *
 * @returns A query string **with** leading `?`, or empty string if no params.
 */
export function buildQuery(
  params?: Record<string, unknown> | null
): string {
  if (!params) return "";

  const q = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item != null) q.append(key, String(item));
      });
    } else {
      q.append(key, String(value));
    }
  }

  const qs = q.toString();
  return qs ? `?${qs}` : "";
}
