import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ReviewDeckPlan } from "../schemas/review-deck-planner.schema";

/**
 * Persists the AI's schema-validated slide plan. PowerPoint generation
 * itself is deterministic app code (see src/lib/deck/pptx-builder.ts) that
 * consumes this record — the AI never touches file generation directly.
 */
export async function create_draft_slide_plan(comparisonId: string, plan: ReviewDeckPlan) {
  return db.presentationSession.upsert({
    where: { comparisonId },
    create: { comparisonId, deckPlanJson: plan as unknown as Prisma.InputJsonValue },
    update: { deckPlanJson: plan as unknown as Prisma.InputJsonValue },
  });
}
