import { db } from "@/lib/db";

export async function get_human_context(comparisonId: string): Promise<string | null> {
  const comparison = await db.comparison.findUnique({
    where: { id: comparisonId },
    select: { context: true },
  });
  return comparison?.context ?? null;
}
