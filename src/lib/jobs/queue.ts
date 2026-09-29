import { after } from "next/server";
import { quickAddJob } from "graphile-worker";
import { JOB_LIMITS, type JobTaskName } from "./job-limits";
import { createJobRun } from "./job-run-tracker";
import { processPendingJobsOnce } from "./run-once";

/**
 * Enqueues a background job and creates the app-level JobRun row used for
 * status visibility (separate from graphile-worker's own internal job table).
 *
 * Also fires an immediate one-shot processing sweep after the response is
 * sent (via Next.js `after()`) — on a deploy with no separate long-running
 * worker process (see run-once.ts), this is what actually picks the job up
 * right away instead of leaving it queued until the next external cron
 * tick. Harmless when a real worker.ts IS running (local dev): the worker
 * usually claims the job first via LISTEN/NOTIFY, and if this sweep finds
 * nothing left to do, runOnce() just returns immediately.
 */
export async function enqueueJob(
  taskIdentifier: JobTaskName,
  comparisonId: string,
  payload: Record<string, unknown> = {},
): Promise<string> {
  const jobRunId = await createJobRun(taskIdentifier, comparisonId);

  await quickAddJob(
    { connectionString: process.env.DATABASE_URL },
    taskIdentifier,
    { comparisonId, jobRunId, ...payload },
    { maxAttempts: JOB_LIMITS[taskIdentifier].maxAttempts },
  );

  after(async () => {
    try {
      await processPendingJobsOnce();
    } catch (error) {
      // The external cron sweep (see /api/cron/process-jobs) is the safety
      // net for this — don't let a failure here surface to the request
      // that already got its response.
      console.error("[enqueueJob] immediate processPendingJobsOnce() failed:", error);
    }
  });

  return jobRunId;
}
