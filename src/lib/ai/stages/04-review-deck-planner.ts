import { reviewDeckPlanSchema, type ReviewDeckPlan } from "../schemas/review-deck-planner.schema";
import { runStage } from "../run-stage";
import { assertWithinCostLimit, recordAiSpend } from "../cost-control";
import { list_confirmed_changes } from "../tools/list_confirmed_changes";
import { get_human_context } from "../tools/get_human_context";
import { create_draft_slide_plan } from "../tools/create_draft_slide_plan";
import { stripInternalTokens } from "../sanitize-text";

const SYSTEM_PROMPT = `You are the Review-Deck Planner stage of Cheil Delta. You are given ONLY the changes a human has already confirmed or edited — never propose including anything else. Produce a slide-by-slide plan: a deck title, and for each slide a title, which confirmed change IDs it covers, an explanation summary drawn from the confirmed/edited explanations, and up to 5 discussion questions.

Explanation summaries must be specific and substantive — carry forward the concrete details already present in each change's explainer output (exact words changed, named regions, colors, sizes) rather than flattening them into a generic one-liner. A reader should be able to tell what actually changed from the summary alone, without opening the deck's appendix. Do not write vague boilerplate like "content was updated" or "some changes were made."

Each change below is labeled with an internal "id=..." field so you can fill in changeIds correctly — that id is an internal reference only. NEVER copy it, or any other id/key/token-looking value, into deckTitle, a slide's title, explanationSummary, or discussionQuestions. Those fields are read by a human reviewer and must contain only clean natural-language text.

Respect the requested presentation length as a target slide count. Output must match the required JSON schema exactly.`;

type ConfirmedChange = Awaited<ReturnType<typeof list_confirmed_changes>>[number];

/**
 * The reviewer's edited text always wins over the AI's original explanation
 * — this is what makes edits made during review actually show up in the
 * generated deck. Without this, a CONFIRMED-but-unedited change still uses
 * the AI's original observedDifference, which is correct; an EDITED change
 * uses editedExplanation, which is the whole point of the edit UI.
 */
function effectiveExplanation(change: ConfirmedChange): string {
  if (change.editedExplanation) return change.editedExplanation;
  const explainer = change.explainerOutput as { observedDifference?: string } | null;
  return explainer?.observedDifference ?? "Change confirmed by reviewer.";
}

/**
 * A title that can never mismatch the body under it, because it doesn't
 * paraphrase the body's content at all — it's derived purely from the
 * change's own structural facts (page number, type). Used whenever a
 * slide's explanationSummary is force-set to a reviewer's edit (see
 * enforceEditedText below): the AI's original title was written to match
 * its OWN draft wording, not the edit that replaces it, so keeping that
 * title would recreate the exact "header still says the old thing" bug
 * this is fixing.
 */
function deterministicSlideTitle(change: ConfirmedChange): string {
  const ref = change.sourceRef as { pageNumber?: number } | null;
  const pageLabel = ref?.pageNumber ? `Page ${ref.pageNumber}` : "Change";
  const typeLabel = change.changeType.charAt(0) + change.changeType.slice(1).toLowerCase();
  return `${pageLabel} — ${typeLabel} Change`;
}

const TARGET_SLIDES: Record<"short" | "standard" | "detailed", (n: number) => number> = {
  short: () => 3,
  standard: (n) => Math.min(8, n),
  detailed: (n) => n,
};

/**
 * Only ever called post-approval (see api/comparisons/[id]/deck/route.ts) —
 * never as part of the automatic pipeline that runs after diffing.
 */
export async function planReviewDeck(
  comparisonId: string,
  opts: { reviewType?: string; presentationLength?: "short" | "standard" | "detailed" } = {},
): Promise<ReviewDeckPlan> {
  await assertWithinCostLimit(comparisonId);

  const [confirmed, context] = await Promise.all([
    list_confirmed_changes(comparisonId),
    get_human_context(comparisonId),
  ]);

  if (confirmed.length === 0) {
    throw new Error("No confirmed changes to build a deck from.");
  }

  const lengthKey = opts.presentationLength ?? "standard";
  const targetSlides = TARGET_SLIDES[lengthKey](confirmed.length);

  const userPrompt = `Review type: ${opts.reviewType ?? "general"}
Target slide count: ~${targetSlides}
Human-provided context: ${context ?? "(none provided)"}
Confirmed changes:
${confirmed
  .map((c) => {
    const explainer = c.explainerOutput as { possibleSignificance?: string } | null;
    const edited = Boolean(c.editedExplanation);
    return `- id=${c.id} type=${c.changeType} explanation${edited ? " (human-edited — this is the reviewer's corrected wording; use it exactly, do not revert to the AI's original observation)" : ""}=${JSON.stringify(effectiveExplanation(c))} possibleSignificance=${JSON.stringify(explainer?.possibleSignificance ?? "")} humanNote=${JSON.stringify(c.humanNote ?? "")}`;
  })
  .join("\n")
  .slice(0, 8000)}

Produce the slide plan.`;

  const { data, costCents } = await runStage({
    schema: reviewDeckPlanSchema,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    mockFallback: () => mockDeckPlan(confirmed),
  });

  const finalData = enforceEditedText(sanitizeDeckPlan(data), confirmed);

  await recordAiSpend(comparisonId, costCents);
  await create_draft_slide_plan(comparisonId, finalData);

  return finalData;
}

/**
 * Strips any leaked internal id/key/token text from every user-facing
 * string the AI produced — see sanitize-text.ts for why a prompt
 * instruction alone isn't enough to prevent this. Runs *before*
 * enforceEditedText so a reviewer's own edited text is never touched by
 * this regex, no matter what it contains — their exact wording is the
 * whole point of that guarantee.
 */
function sanitizeDeckPlan(plan: ReviewDeckPlan): ReviewDeckPlan {
  return {
    deckTitle: stripInternalTokens(plan.deckTitle),
    slides: plan.slides.map((slide) => ({
      ...slide,
      title: stripInternalTokens(slide.title),
      explanationSummary: stripInternalTokens(slide.explanationSummary),
      discussionQuestions: slide.discussionQuestions.map(stripInternalTokens).filter(Boolean),
    })),
  };
}

/**
 * The system prompt instructs the model to use a human-edited explanation
 * "exactly," but that's still just an instruction to a generative step —
 * nothing stops the model paraphrasing it, especially a weaker/local
 * provider. A prompt hint isn't a guarantee, and the product requirement is
 * a guarantee ("the deck should always reflect [the edit] once I've made a
 * correction"), so this deterministically overwrites explanationSummary
 * with the reviewer's exact edited text for any slide built from exactly
 * one confirmed change — the common case (one change, one slide). Slides
 * that group multiple changes are left to the AI's synthesis, since there's
 * no single "the edit" to force in that case.
 *
 * The title gets forced too, to a deterministic, content-independent form
 * (deterministicSlideTitle) — not because the title itself needs "fixing,"
 * but because the AI wrote its original title to match its OWN draft
 * explanation, which this function just replaced. Leaving that title in
 * place would reintroduce the exact "header still describes the old
 * version" bug this function exists to close: the header and body must
 * always describe the same content, and the only way to guarantee that
 * without a second unreliable AI call is a title that doesn't depend on
 * paraphrasing body content in the first place.
 */
function enforceEditedText(plan: ReviewDeckPlan, confirmed: ConfirmedChange[]): ReviewDeckPlan {
  const changeById = new Map(confirmed.map((c) => [c.id, c]));
  return {
    ...plan,
    slides: plan.slides.map((slide) => {
      if (slide.changeIds.length !== 1) return slide;
      const change = changeById.get(slide.changeIds[0]);
      if (!change?.editedExplanation) return slide;
      return {
        ...slide,
        title: deterministicSlideTitle(change),
        explanationSummary: change.editedExplanation,
      };
    }),
  };
}

function mockDeckPlan(confirmed: ConfirmedChange[]): ReviewDeckPlan {
  return {
    deckTitle: "Version Review (mock)",
    slides: confirmed.map((c) => {
      const explainer = c.explainerOutput as { possibleSignificance?: string } | null;
      return {
        title: deterministicSlideTitle(c),
        changeIds: [c.id],
        explanationSummary: effectiveExplanation(c),
        discussionQuestions: explainer?.possibleSignificance
          ? [`Is this significant: ${explainer.possibleSignificance}?`]
          : [],
      };
    }),
  };
}
