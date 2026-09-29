import type { AIProvider, GenerateStructuredParams, GenerateStructuredResult } from "../provider";

/**
 * Tries each wrapped provider in order and returns the first success —
 * e.g. Claude first, then OpenAI if Claude's API is down or rate-limited.
 * Not a quality vote between providers (that would mean paying for both on
 * every call); it's availability failover, tried in AI_FALLBACK_ORDER.
 *
 * Schema-validation retries (see run-stage.ts) are a separate, unrelated
 * concern — this only reacts to a provider call actually throwing (network
 * error, API error, auth failure), not to the model producing output that
 * later fails Zod validation.
 */
export class FallbackAIProvider implements AIProvider {
  readonly name: string;

  constructor(private readonly providers: AIProvider[]) {
    if (providers.length === 0) {
      throw new Error("FallbackAIProvider requires at least one underlying provider.");
    }
    this.name = `fallback(${providers.map((p) => p.name).join(" -> ")})`;
  }

  async generateStructured(params: GenerateStructuredParams): Promise<GenerateStructuredResult> {
    const errors: string[] = [];

    for (const [index, provider] of this.providers.entries()) {
      try {
        return await provider.generateStructured(params);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${provider.name}: ${message}`);
        const isLast = index === this.providers.length - 1;
        console.warn(
          `[FallbackAIProvider] ${provider.name} failed${isLast ? " (no more providers to try)" : ", falling back to next provider"}: ${message}`,
        );
      }
    }

    throw new Error(`All AI providers in the fallback chain failed:\n${errors.join("\n")}`);
  }
}
