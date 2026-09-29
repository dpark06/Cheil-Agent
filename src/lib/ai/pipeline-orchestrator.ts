import { db } from "@/lib/db";
import { classifyChange } from "./stages/01-change-classifier";
import { explainChange } from "./stages/02-change-explainer";
import { mapRelationships } from "./stages/03-relationship-mapper";

export { StageValidationError } from "./run-stage";
export { planReviewDeck } from "./stages/04-review-deck-planner";

/**
 * Runs stages 1-3 (Classifier -> Explainer -> Relationship Mapper)
 * sequentially over every detected change in a diffed comparison. This is a
 * controlled orchestration, not an autonomous agent: each stage is invoked
 * directly by this function with pre-built context, never by the model
 * calling tools itself. Stage 4 (deck planner) intentionally does NOT run
 * here — it only runs post-approval (see api/comparisons/[id]/deck/route.ts).
 */
export async function runAiPipeline(comparisonId: string): Promise<void> {
  const changes = await db.detectedChange.findMany({
    where: { comparisonId },
    select: { id: true },
  });

  await db.comparison.update({
    where: { id: comparisonId },
    data: { status: "AI_PROCESSING", processedCount: 0, totalCount: changes.length },
  });

  for (const [index, change] of changes.entries()) {
    await classifyChange(comparisonId, change.id);
    await explainChange(comparisonId, change.id);
    await db.comparison.update({
      where: { id: comparisonId },
      data: { processedCount: index + 1 },
    });
  }

  await mapRelationships(comparisonId);

  await db.comparison.update({
    where: { id: comparisonId },
    data: { status: "READY_FOR_REVIEW", processedCount: null, totalCount: null },
  });
}
