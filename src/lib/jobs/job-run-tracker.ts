import { db } from "@/lib/db";
import type { JobTaskName } from "./job-limits";

export async function createJobRun(taskIdentifier: JobTaskName, comparisonId: string): Promise<string> {
  const jobRun = await db.jobRun.create({
    data: { taskIdentifier, comparisonId, status: "QUEUED" },
  });
  return jobRun.id;
}

export async function markJobRunning(jobRunId: string): Promise<void> {
  await db.jobRun.update({
    where: { id: jobRunId },
    data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
  });
}

export async function markJobSucceeded(jobRunId: string): Promise<void> {
  await db.jobRun.update({
    where: { id: jobRunId },
    data: { status: "SUCCEEDED", finishedAt: new Date() },
  });
}

export async function markJobFailed(jobRunId: string, error: unknown): Promise<void> {
  await db.jobRun.update({
    where: { id: jobRunId },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      lastError: error instanceof Error ? error.message : String(error),
    },
  });
}
