import { z } from "zod";

export const relationshipSchema = z.object({
  changeIds: z.array(z.string()).min(2).max(10),
  relationshipDescription: z.string().max(500),
  affectedTeams: z.array(
    z.enum(["STRATEGY", "COPY", "DESIGN", "MEDIA", "CLIENT_SERVICE", "OTHER"]),
  ),
  confidence: z.number().min(0).max(1),
});

export const relationshipMapperOutputSchema = z.object({
  relationships: z.array(relationshipSchema).max(20),
  openQuestions: z.array(z.string().max(300)).max(10),
});

export type RelationshipMapperOutput = z.infer<typeof relationshipMapperOutputSchema>;
