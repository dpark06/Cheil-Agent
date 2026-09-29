import type { Task } from "graphile-worker";
import { db } from "@/lib/db";
import { processComparisonDiff } from "@/lib/diff/diff-orchestrator";
import { runAiPipeline } from "@/lib/ai/pipeline-orchestrator";
import { withTimeout } from "../job-limits";
import { markJobRunning, markJobSucceeded, markJobFailed } from "../job-run-tracker";

interface Payload {
  comparisonId: string;
  jobRunId: string;
}

export const processComparisonTask: Task = async (payload) => {
  const { comparisonId, jobRunId } = payload as Payload;
  await markJobRunning(jobRunId);

  try {
    await withTimeout(processComparisonDiff(comparisonId), "process-comparison");
    await withTimeout(runAiPipeline(comparisonId), "process-comparison");
    await markJobSucceeded(jobRunId);
  } catch (error) {
    await db.comparison.update({
      where: { id: comparisonId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Processing failed.",
        processedCount: null,
        totalCount: null,
      },
    });
    await markJobFailed(jobRunId, error);
    throw error;
  }
};
