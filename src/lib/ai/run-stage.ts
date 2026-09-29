import type { z } from "zod";
import { getAIProvider } from "./provider-factory";
import type { AIImageInput } from "./provider";

const MAX_RETRIES = 2;

export class StageValidationError extends Error {}

/**
 * Calls the configured AI provider and validates the raw response against
 * the stage's Zod schema, retrying with a correction prompt on failure. This
 * is the "bounded, not autonomous" enforcement point — the model's raw
 * output is never trusted or written anywhere until it parses cleanly.
 */
export async function runStage<T>(opts: {
  schema: z.ZodType<T>;
  systemPrompt: string;
  userPrompt: string;
  images?: AIImageInput[];
  mockFallback: () => T;
}): Promise<{ data: T; costCents: number }> {
  const provider = getAIProvider();
  let lastError: string | undefined;
  let totalCostCents = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const userPrompt = lastError
      ? `${opts.userPrompt}\n\n--- Your previous response was invalid ---\n${lastError}\nReturn ONLY valid JSON matching the required schema.`
      : opts.userPrompt;

    const result = await provider.generateStructured({
      schema: opts.schema as z.ZodType<unknown>,
      systemPrompt: opts.systemPrompt,
      userPrompt,
      images: opts.images,
      mockFallback: opts.mockFallback as () => unknown,
    });
    totalCostCents += result.costCents;

    const parsed = opts.schema.safeParse(result.raw);
    if (parsed.success) {
      return { data: parsed.data, costCents: totalCostCents };
    }
    lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }

  throw new StageValidationError(
    `AI stage output failed schema validation after ${MAX_RETRIES + 1} attempts: ${lastError}`,
  );
}
