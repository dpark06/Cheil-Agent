import type { z } from "zod";

export interface AIImageInput {
  data: Buffer;
  mimeType: string;
}

export interface GenerateStructuredParams {
  /** Not sent to mock providers — real providers derive a JSON schema from it for structured output. */
  schema: z.ZodType<unknown>;
  systemPrompt: string;
  userPrompt: string;
  images?: AIImageInput[];
  /**
   * Produces deterministic, context-aware fake output for MockAIProvider.
   * Ignored by real providers. Colocated with each stage's prompt so the
   * fake output is actually derived from the same inputs as the real prompt.
   */
  mockFallback: () => unknown;
}

export interface GenerateStructuredResult {
  /** Unvalidated — the pipeline orchestrator is responsible for schema validation and retry. */
  raw: unknown;
  costCents: number;
}

export interface AIProvider {
  readonly name: string;
  generateStructured(params: GenerateStructuredParams): Promise<GenerateStructuredResult>;
}
