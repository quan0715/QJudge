export function roundScore(value: number | string | null | undefined): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.round(numeric * 100) / 100;
}

export function formatScore(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return roundScore(numeric).toFixed(2);
}

/** Student-facing score without padded decimals, e.g. 5 or 2.5. */
export function formatScoreCompact(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(roundScore(numeric)) : "-";
}
