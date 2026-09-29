import "dotenv/config";
import { run } from "graphile-worker";
import { taskList } from "./task-list";
import { validateEnv } from "@/lib/env-validation";

async function main() {
  validateEnv();

  const runner = await run({
    connectionString: process.env.DATABASE_URL,
    concurrency: 5,
    taskList,
    // Runs cleanup-temp-files every 6 hours; see docs/known-gaps.md for what
    // the retention policy does and does not cover.
    crontab: "0 */6 * * * cleanup-temp-files",
  });

  console.log("Cheil Delta worker started.");
  await runner.promise;
}

main().catch((error) => {
  console.error("Worker crashed:", error);
  process.exit(1);
});
