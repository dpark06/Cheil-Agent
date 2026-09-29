import type { Task } from "graphile-worker";
import { generateDeckForComparison } from "@/lib/deck/generate-deck";
import { withTimeout } from "../job-limits";
import { markJobRunning, markJobSucceeded, markJobFailed } from "../job-run-tracker";

interface Payload {
  comparisonId: string;
  jobRunId: string;
  userId?: string | null;
}

export const generateDeckTask: Task = async (payload) => {
  const { comparisonId, jobRunId, userId } = payload as Payload;
  await markJobRunning(jobRunId);

  try {
    await withTimeout(generateDeckForComparison(comparisonId, userId), "generate-deck");
    await markJobSucceeded(jobRunId);
  } catch (error) {
    // generateDeckForComparison already sets Comparison.status = FAILED on error.
    await markJobFailed(jobRunId, error);
    throw error;
  }
};
