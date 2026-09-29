import { quickAddJob } from "graphile-worker";
import { JOB_LIMITS, type JobTaskName } from "./job-limits";
import { createJobRun } from "./job-run-tracker";

/**
 * Enqueues a background job and creates the app-level JobRun row used for
 * status visibility (separate from graphile-worker's own internal job table).
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

  return jobRunId;
}
