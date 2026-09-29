import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getStorageAdapter } from "@/lib/storage/local-storage-adapter";
import { planReviewDeck } from "@/lib/ai/pipeline-orchestrator";
import { buildPptx } from "./pptx-builder";
import { logAuditEvent } from "@/lib/audit/audit-log";
import { DECK_GENERATION_STAGES } from "./generation-stages";

export class DeckNotReadyError extends Error {}

export async function generateDeckForComparison(
  comparisonId: string,
  userId?: string | null,
): Promise<{ slideCount: number }> {
  const comparison = await db.comparison.findUniqueOrThrow({
    where: { id: comparisonId },
    include: { detectedChanges: true },
  });

  const pendingCount = comparison.detectedChanges.filter((c) => c.reviewStatus === "PENDING").length;
  if (comparison.detectedChanges.length === 0 || pendingCount > 0) {
    throw new DeckNotReadyError("All detected changes must be reviewed before generating a deck.");
  }

  await db.comparison.update({
    where: { id: comparisonId },
    data: { status: "GENERATING_DECK", deckGenerationStage: DECK_GENERATION_STAGES.READING_CHANGES },
  });

  try {
    await db.comparison.update({
      where: { id: comparisonId },
      data: { deckGenerationStage: DECK_GENERATION_STAGES.CALLING_AI },
    });
    const plan = await planReviewDeck(comparisonId);

    await db.comparison.update({
      where: { id: comparisonId },
      data: { deckGenerationStage: DECK_GENERATION_STAGES.BUILDING_DECK },
    });
    const pptxBuffer = await buildPptx(plan, comparison.detectedChanges);

    // Basic integrity check: a .pptx is a zip archive (PK magic bytes) and
    // should be non-trivially sized. Doesn't fully open/validate the file,
    // but catches empty/corrupt output before marking the job complete.
    const isZip = pptxBuffer.length > 1000 && pptxBuffer.subarray(0, 2).toString("ascii") === "PK";
    if (!isZip) {
      throw new Error("Generated presentation file failed integrity check.");
    }

    const slideCount = plan.slides.length + 1;

    // Every version gets its own storage key and its own DeckVersion row —
    // regenerating after a post-completion edit must not destroy the
    // previous deck. PresentationSession is kept in step as a pointer to
    // the *current* version, since the existing download route reads it.
    const previousVersionCount = await db.deckVersion.count({ where: { comparisonId } });
    const versionNumber = previousVersionCount + 1;

    const storage = getStorageAdapter();
    const pptxKey = `${comparisonId}/decks/v${versionNumber}.pptx`;
    await storage.put(pptxKey, pptxBuffer);

    await db.deckVersion.create({
      data: {
        comparisonId,
        versionNumber,
        deckPlanJson: plan as unknown as Prisma.InputJsonValue,
        pptxStoragePath: pptxKey,
        slideCount,
        generatedByUserId: userId ?? null,
      },
    });

    await db.presentationSession.upsert({
      where: { comparisonId },
      create: {
        comparisonId,
        deckPlanJson: plan as unknown as Prisma.InputJsonValue,
        pptxStoragePath: pptxKey,
        slideCount,
        generatedAt: new Date(),
      },
      update: {
        deckPlanJson: plan as unknown as Prisma.InputJsonValue,
        pptxStoragePath: pptxKey,
        slideCount,
        generatedAt: new Date(),
      },
    });

    await db.comparison.update({
      where: { id: comparisonId },
      data: { status: "COMPLETE", deckGenerationStage: null },
    });
    await logAuditEvent({
      userId,
      comparisonId,
      eventType: "deck_generated",
      payload: { slideCount, versionNumber },
    });

    return { slideCount };
  } catch (error) {
    await db.comparison.update({
      where: { id: comparisonId },
      data: {
        status: "FAILED",
        deckGenerationStage: null,
        errorMessage: error instanceof Error ? error.message : "Deck generation failed.",
      },
    });
    throw error;
  }
}
