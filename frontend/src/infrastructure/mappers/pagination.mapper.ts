/**
 * Generic mapper for Django REST Framework paginated responses.
 *
 * Handles both paginated (`{ results, count, next, previous }`)
 * and flat array responses gracefully.
 */
export function mapPaginatedResponse<T>(
  data: any,
  mapFn: (item: any) => T
): { results: T[]; count: number; next: string | null; previous: string | null } {
  const results = data.results || data;
  return {
    results: Array.isArray(results) ? results.map(mapFn) : [],
    count: data.count ?? (Array.isArray(results) ? results.length : 0),
    next: data.next ?? null,
    previous: data.previous ?? null,
  };
}
