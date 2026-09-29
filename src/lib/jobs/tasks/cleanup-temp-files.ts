import type { Task } from "graphile-worker";
import { db } from "@/lib/db";
import { getStorageAdapter } from "@/lib/storage/local-storage-adapter";
import { LIMITS } from "@/lib/config/limits";

/**
 * Scheduled cleanup (see worker.ts crontab). Deletes source PDFs and
 * intermediate page renders/diff overlays for finished comparisons past the
 * retention window — the generated .pptx and all DB metadata are kept.
 */
export const cleanupTempFilesTask: Task = async (_payload, helpers) => {
  const cutoff = new Date(Date.now() - LIMITS.fileRetentionHours * 60 * 60 * 1000);
  const storage = getStorageAdapter();

  const comparisons = await db.comparison.findMany({
    where: { createdAt: { lt: cutoff }, status: { in: ["COMPLETE", "FAILED"] } },
    select: { id: true, fileAssets: { select: { storagePath: true } } },
  });

  for (const comparison of comparisons) {
    for (const asset of comparison.fileAssets) {
      await storage.delete(asset.storagePath).catch(() => {});
    }
    await storage.deletePrefix(`${comparison.id}/pages`).catch(() => {});
    await storage.deletePrefix(`${comparison.id}/diffs`).catch(() => {});
  }

  helpers.logger.info(`cleanup-temp-files: processed ${comparisons.length} comparison(s)`);
};
