import { runOnce } from "graphile-worker";
import { taskList } from "./task-list";

/**
 * Processes every currently-available graphile-worker job once, then
 * returns — as opposed to worker.ts's `run()`, which polls forever. This is
 * graphile-worker's own building block for serverless/cron deployments,
 * where nothing can stay running between requests.
 *
 * Used two ways, both calling this same function:
 *  1. Fired immediately (via Next.js `after()`) right after a job is
 *     enqueued, so a serverless deploy processes it right away instead of
 *     waiting for the next scheduled sweep — keeps the existing live
 *     progress-bar UX intact rather than everything feeling frozen for
 *     however long the external cron interval is.
 *  2. Hit periodically by an external scheduler (see
 *     /api/cron/process-jobs) as a catch-up safety net, in case #1 never
 *     ran (the serverless function was killed early) or a job needs a
 *     retry.
 *
 * Local dev is unaffected either way — worker.ts's long-running `run()`
 * keeps working exactly as before and will normally pick jobs up first.
 */
export async function processPendingJobsOnce(): Promise<void> {
  await runOnce({
    connectionString: process.env.DATABASE_URL,
    concurrency: 5,
    taskList,
  });
}
