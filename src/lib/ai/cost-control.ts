import { db } from "@/lib/db";
import { LIMITS } from "@/lib/config/limits";

export class CostLimitExceededError extends Error {
  constructor(comparisonId: string, spentCents: number) {
    super(
      `Comparison ${comparisonId} exceeded its AI cost cap ` +
        `(${spentCents}¢ >= ${LIMITS.maxAiCostCentsPerSession}¢).`,
    );
    this.name = "CostLimitExceededError";
  }
}

/** Throws if the comparison has already hit its per-session AI cost cap. */
export async function assertWithinCostLimit(comparisonId: string): Promise<void> {
  const comparison = await db.comparison.findUniqueOrThrow({
    where: { id: comparisonId },
    select: { tokenCostCents: true },
  });
  if (comparison.tokenCostCents >= LIMITS.maxAiCostCentsPerSession) {
    throw new CostLimitExceededError(comparisonId, comparison.tokenCostCents);
  }
}

/** Records spend after a stage call and returns the new running total. */
export async function recordAiSpend(comparisonId: string, costCents: number): Promise<number> {
  if (costCents <= 0) return (await db.comparison.findUniqueOrThrow({ where: { id: comparisonId }, select: { tokenCostCents: true } })).tokenCostCents;
  const updated = await db.comparison.update({
    where: { id: comparisonId },
    data: { tokenCostCents: { increment: Math.ceil(costCents) } },
    select: { tokenCostCents: true },
  });
  return updated.tokenCostCents;
}
