import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  changeClassifierOutputSchema,
  type ChangeClassifierOutput,
} from "../schemas/change-classifier.schema";
import { runStage } from "../run-stage";
import { assertWithinCostLimit, recordAiSpend } from "../cost-control";

const SYSTEM_PROMPT = `You are the Change Classifier stage of Cheil Delta, a tool that compares two versions of a creative/marketing document. You are given ONE deterministically-detected difference — you are not detecting changes yourself, only categorizing one that was already found by non-AI code. Never invent changes that weren't given to you. Output must match the required JSON schema exactly.`;

export async function classifyChange(
  comparisonId: string,
  detectedChangeId: string,
): Promise<ChangeClassifierOutput> {
  await assertWithinCostLimit(comparisonId);

  const change = await db.detectedChange.findUniqueOrThrow({ where: { id: detectedChangeId } });
  const sourceRef = change.sourceRef as { pageNumber?: number };

  const userPrompt = `Change type (deterministically detected): ${change.changeType}
Page: ${sourceRef.pageNumber ?? "unknown"}
Raw diff data: ${JSON.stringify(change.rawDiffData).slice(0, 4000)}

Classify this change.`;

  const { data, costCents } = await runStage({
    schema: changeClassifierOutputSchema,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    mockFallback: () => mockClassify(change.changeType),
  });

  await recordAiSpend(comparisonId, costCents);
  await db.detectedChange.update({
    where: { id: detectedChangeId },
    data: { classifierOutput: data as unknown as Prisma.InputJsonValue },
  });

  return data;
}

function mockClassify(changeType: string): ChangeClassifierOutput {
  switch (changeType) {
    case "TEXT":
      return {
        category: "COPY",
        isMeaningful: true,
        confidence: 0.7,
        reasoning: "Deterministic text diff found added/removed words (mock classification).",
      };
    case "IMAGE":
      return {
        category: "DESIGN",
        isMeaningful: true,
        confidence: 0.65,
        reasoning: "Deterministic pixel diff found a visually changed region (mock classification).",
      };
    case "ADDED":
      return {
        category: "OTHER",
        isMeaningful: true,
        confidence: 0.9,
        reasoning: "Page present only in the new version (mock classification).",
      };
    default:
      return {
        category: "OTHER",
        isMeaningful: true,
        confidence: 0.9,
        reasoning: "Page present only in the previous version (mock classification).",
      };
  }
}
