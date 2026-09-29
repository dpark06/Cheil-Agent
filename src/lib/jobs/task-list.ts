import type { TaskList } from "graphile-worker";
import { processComparisonTask } from "./tasks/process-comparison";
import { generateDeckTask } from "./tasks/generate-deck";
import { cleanupTempFilesTask } from "./tasks/cleanup-temp-files";

export const taskList: TaskList = {
  "process-comparison": processComparisonTask,
  "generate-deck": generateDeckTask,
  "cleanup-temp-files": cleanupTempFilesTask,
};
