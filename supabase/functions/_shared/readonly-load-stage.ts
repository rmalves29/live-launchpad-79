export interface ReadonlyStageOptions {
  concurrency: number;
  seconds: number;
  maxRequests: number;
}

export async function runReadonlyStage(
  options: ReadonlyStageOptions,
  request: (index: number) => Promise<{ ok: boolean; status: number; bytes: number; error?: string }>,
) {
  const concurrency = Math.min(1024, Math.max(1, Math.floor(options.concurrency)));
  const durationMs = Math.min(12000, Math.max(1000, options.seconds * 1000));
  const maxRequests = Math.min(2000, Math.max(1, Math.floor(options.maxRequests)));
  const start = performance.now();
  const times: number[] = [];
  const statuses: Record<string, number> = {};
  const errors: Record<string, number> = {};
  let launched = 0, failed = 0, bytes = 0, stopReason: string | null = null;
  const quantile = (sorted: number[], p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (!stopReason && performance.now() - start < durationMs && launched < maxRequests) {
      const index = launched++;
      const before = performance.now();
      let result;
      try { result = await request(index); } catch (error) { result = { ok: false, status: 0, bytes: 0, error: String(error).slice(0, 160) }; }
      times.push(performance.now() - before);
      statuses[String(result.status)] = (statuses[String(result.status)] || 0) + 1;
      if (!result.ok) {
        failed++;
        const reason = result.error || `HTTP_${result.status}_or_business_failure`;
        errors[reason] = (errors[reason] || 0) + 1;
      }
      bytes += result.bytes;
      // A few failures or persistently slow responses stop new traffic immediately.
      if (times.length >= 20 && failed >= 3 && failed / times.length > 0.02) stopReason = 'error_rate_above_2_percent';
      if (times.length >= 30 && times.length % 10 === 0 && quantile([...times].sort((a, b) => a - b), 0.95) > 3000) stopReason = 'p95_above_3000_ms';
      if (!stopReason) await new Promise(resolve => setTimeout(resolve, 150));
    }
  }));
  const elapsed = performance.now() - start;
  const sorted = [...times].sort((a, b) => a - b);
  return {
    concurrency, requests: times.length, failed, errorRate: times.length ? failed / times.length : 0,
    elapsedMs: Math.round(elapsed), requestsPerSecond: +(times.length / (elapsed / 1000)).toFixed(2),
    meanMs: Math.round(times.reduce((a, b) => a + b, 0) / (times.length || 1)),
    p50Ms: Math.round(quantile(sorted, 0.5)), p95Ms: Math.round(quantile(sorted, 0.95)),
    p99Ms: Math.round(quantile(sorted, 0.99)), maxMs: Math.round(sorted.at(-1) || 0),
    bytes, statuses, errors, stopReason, requestCapReached: launched >= maxRequests,
  };
}
