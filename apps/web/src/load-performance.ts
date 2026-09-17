export type LoadPerformanceDetail = Readonly<Record<string, unknown>>;

/** Records structured timings without making diagnostics part of product UI. */
export function recordLoadDuration(
  name: string,
  startedAt: number,
  detail: LoadPerformanceDetail = {},
): number {
  const duration = performance.now() - startedAt;
  try {
    performance.measure(`4ecb:${name}`, {
      start: startedAt,
      duration,
      detail,
    });
  } catch {
    // Performance diagnostics must never affect character loading.
  }
  return duration;
}
