export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Millisecond wall-clock, HH:MM:SS.mmm. Full ids elsewhere, never truncated. */
export function ts(iso: string): string {
  return iso.slice(11, 23);
}

export function gapLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
