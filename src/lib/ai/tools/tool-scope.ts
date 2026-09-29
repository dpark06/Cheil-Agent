import { db } from "@/lib/db";

/**
 * Every tool takes comparisonId explicitly and every query below filters by
 * it — this is what keeps AI-visible data scoped to one comparison. This
 * guard is a defense-in-depth existence check, not the primary boundary.
 */
export async function assertComparisonExists(comparisonId: string): Promise<void> {
  const exists = await db.comparison.findUnique({
    where: { id: comparisonId },
    select: { id: true },
  });
  if (!exists) {
    throw new Error(`Comparison ${comparisonId} not found`);
  }
}
