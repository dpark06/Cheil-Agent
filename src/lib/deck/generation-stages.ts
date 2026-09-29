/**
 * Coarse phases of deck generation, written to Comparison.deckGenerationStage
 * while status = GENERATING_DECK so the UI can show which phase is running.
 * Plain string constants (not a Prisma enum) since this is a transient
 * progress marker, not a durable/queryable piece of state.
 */
export const DECK_GENERATION_STAGES = {
  READING_CHANGES: "READING_CHANGES",
  CALLING_AI: "CALLING_AI",
  BUILDING_DECK: "BUILDING_DECK",
} as const;

export type DeckGenerationStage = (typeof DECK_GENERATION_STAGES)[keyof typeof DECK_GENERATION_STAGES];

export const DECK_GENERATION_STAGE_LABELS: Record<DeckGenerationStage, string> = {
  READING_CHANGES: "Reading confirmed changes",
  CALLING_AI: "Asking the AI to plan the presentation",
  BUILDING_DECK: "Building the PowerPoint file",
};

/** Fixed checkpoint percentages — coarse, but real (not indeterminate),
 * since these three stages always happen in this order. */
export const DECK_GENERATION_STAGE_PERCENT: Record<DeckGenerationStage, number> = {
  READING_CHANGES: 15,
  CALLING_AI: 55,
  BUILDING_DECK: 90,
};
