import type { AIProvider, GenerateStructuredParams, GenerateStructuredResult } from "../provider";

/**
 * Zero-cost, zero-dependency default provider. Produces deterministic output
 * via each stage's `mockFallback`, so the whole app runs end-to-end with no
 * AI API key configured. Never calls out to any network.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async generateStructured(params: GenerateStructuredParams): Promise<GenerateStructuredResult> {
    return { raw: params.mockFallback(), costCents: 0 };
  }
}
