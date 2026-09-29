import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  relationshipMapperOutputSchema,
  type RelationshipMapperOutput,
} from "../schemas/relationship-mapper.schema";
import { runStage } from "../run-stage";
import { assertWithinCostLimit, recordAiSpend } from "../cost-control";
import { get_human_context } from "../tools/get_human_context";
import { get_selected_file_metadata } from "../tools/get_selected_file_metadata";
import { stripInternalTokens } from "../sanitize-text";

const SYSTEM_PROMPT = `You are the Relationship Mapper stage of Cheil Delta. You are given a list of already-explained changes across a comparison. Identify only relationships that are actually supported by the given changes — do not invent connections that aren't there. For each relationship, list which change IDs it involves, which teams it might affect, and a confidence score. Also list open questions a human should confirm. Output must match the required JSON schema exactly.

Each change below is labeled with an internal "id=..." field so you can fill in changeIds correctly — that id is an internal reference only. NEVER copy it, or any other id/key/token-looking value, into relationshipDescription or openQuestions. Those fields are read by a human and must contain only clean natural-language text.`;

export async function mapRelationships(comparisonId: string): Promise<RelationshipMapperOutput | null> {
  await assertWithinCostLimit(comparisonId);

  const changes = await db.detectedChange.findMany({
    where: { comparisonId, explainerOutput: { not: Prisma.JsonNull } },
  });
  if (changes.length < 2) return null;

  const [context, files] = await Promise.all([
    get_human_context(comparisonId),
    get_selected_file_metadata(comparisonId),
  ]);

  const userPrompt = `Files: ${JSON.stringify(files)}
Human-provided context: ${context ?? "(none provided)"}
Changes:
${changes
  .map((c) => `- id=${c.id} type=${c.changeType} explainer=${JSON.stringify(c.explainerOutput)}`)
  .join("\n")
  .slice(0, 6000)}

Identify relationships between these changes, if any, and list open questions.`;

  const { data, costCents } = await runStage({
    schema: relationshipMapperOutputSchema,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    mockFallback: () => mockRelationships(changes.map((c) => c.id)),
  });

  // Same leaked-id risk as the review-deck planner (see sanitize-text.ts):
  // changeIds themselves are left alone (real ids, used for the DB
  // relation below) — only the human-readable prose fields are sanitized.
  const sanitized: RelationshipMapperOutput = {
    relationships: data.relationships.map((rel) => ({
      ...rel,
      relationshipDescription: stripInternalTokens(rel.relationshipDescription),
    })),
    openQuestions: data.openQuestions.map(stripInternalTokens).filter(Boolean),
  };

  await recordAiSpend(comparisonId, costCents);

  for (const rel of sanitized.relationships) {
    const group = await db.relationshipGroup.create({
      data: { comparisonId, relationshipOutput: rel as unknown as Prisma.InputJsonValue },
    });
    await db.detectedChange.updateMany({
      where: { id: { in: rel.changeIds }, comparisonId },
      data: { relationshipGroupId: group.id },
    });
  }

  return sanitized;
}

function mockRelationships(changeIds: string[]): RelationshipMapperOutput {
  if (changeIds.length < 2) return { relationships: [], openQuestions: [] };
  return {
    relationships: [
      {
        changeIds: changeIds.slice(0, 2),
        relationshipDescription:
          "These changes appear across related pages of the same document (mock relationship).",
        affectedTeams: ["STRATEGY", "DESIGN"],
        confidence: 0.4,
      },
    ],
    openQuestions: ["Were these changes coordinated across teams, or made independently?"],
  };
}
