import { z } from "zod";

export const changeExplainerOutputSchema = z.object({
  previousDescription: z.string().max(300),
  newDescription: z.string().max(300),
  /**
   * Objective, verifiable statement of what changed — no interpretation.
   * This is the one field shown as "Observed" in the review UI and, unless
   * a reviewer edits it, becomes the deck slide's body text — so it's
   * capped much tighter than the others: one short scannable sentence, not
   * a paragraph. See 02-change-explainer.ts's cleanObservedSummary for the
   * deterministic enforcement of this (the cap here is a schema-level
   * ceiling that triggers a retry if crossed, not the only guarantee).
   */
  observedDifference: z.string().max(180),
  /** Clearly-labeled interpretation of why this might matter — never presented as fact. */
  possibleSignificance: z.string().max(500),
  confidence: z.number().min(0).max(1),
  needsHumanConfirmation: z.boolean(),
});

export type ChangeExplainerOutput = z.infer<typeof changeExplainerOutputSchema>;
