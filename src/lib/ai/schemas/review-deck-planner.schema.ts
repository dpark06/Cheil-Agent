import { z } from "zod";

export const deckSlideSchema = z.object({
  title: z.string().max(120),
  changeIds: z.array(z.string()).max(20),
  explanationSummary: z.string().max(600),
  discussionQuestions: z.array(z.string().max(300)).max(5),
});

export const reviewDeckPlanSchema = z.object({
  deckTitle: z.string().max(150),
  slides: z.array(deckSlideSchema).min(1).max(50),
});

export type DeckSlide = z.infer<typeof deckSlideSchema>;
export type ReviewDeckPlan = z.infer<typeof reviewDeckPlanSchema>;
