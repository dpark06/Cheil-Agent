import { z } from "zod";

export const changeClassifierOutputSchema = z.object({
  category: z.enum(["COPY", "DESIGN", "LAYOUT", "COLOR", "STRATEGY", "OTHER"]),
  isMeaningful: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500),
});

export type ChangeClassifierOutput = z.infer<typeof changeClassifierOutputSchema>;
