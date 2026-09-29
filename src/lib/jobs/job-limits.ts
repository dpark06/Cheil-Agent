export const JOB_LIMITS = {
  "process-comparison": { timeoutMs: 10 * 60 * 1000, maxAttempts: 1 },
  "generate-deck": { timeoutMs: 2 * 60 * 1000, maxAttempts: 1 },
  "cleanup-temp-files": { timeoutMs: 5 * 60 * 1000, maxAttempts: 1 },
} as const;

export type JobTaskName = keyof typeof JOB_LIMITS;

export class JobTimeoutError extends Error {}

/**
 * maxAttempts is 1 for process-comparison/generate-deck rather than
 * graphile-worker's default retry behavior: the diff/AI pipeline isn't
 * idempotent (re-running after a partial failure would create duplicate
 * DetectedChange/ExtractedPage rows or hit unique-constraint errors). See
 * docs/known-gaps.md — a production version needs upsert-based resumable
 * tasks before retries are safe to enable.
 */
export async function withTimeout<T>(promise: Promise<T>, taskName: JobTaskName): Promise<T> {
  const { timeoutMs } = JOB_LIMITS[taskName];
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new JobTimeoutError(`Task "${taskName}" exceeded its ${timeoutMs}ms timeout.`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
