import { zodToJsonSchema } from "zod-to-json-schema";
import type { AIProvider, GenerateStructuredParams, GenerateStructuredResult } from "../provider";

interface OllamaChatMessage {
  role: "system" | "user";
  content: string;
  images?: string[];
}

interface OllamaChatResponse {
  message?: { role: string; content: string };
  error?: string;
}

/**
 * Ollama's `format` param constrains the JSON's shape (field names/types)
 * but — confirmed by hand-testing against a live local llava instance
 * during development of this provider — does NOT enforce numeric
 * minimum/maximum the way OpenAI's json_schema mode or a real Zod parse
 * does. llava reliably returns "confidence": 100 for a field documented
 * as 0-1. Every stage schema's only bounded numeric field is `confidence`,
 * so this narrowly renormalizes an out-of-range percentage-style value
 * back to a 0-1 fraction before schema validation, rather than burning a
 * retry (and 2-5s of local inference) on a mistake this predictable.
 */
function normalizeConfidence(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  for (const [key, v] of Object.entries(obj)) {
    if (key === "confidence" && typeof v === "number" && v > 1 && v <= 100) {
      obj[key] = v / 100;
    } else if (v !== null && typeof v === "object") {
      normalizeConfidence(v);
    }
  }
  return obj;
}

/**
 * Runs entirely against a local Ollama instance — no API key, no per-call
 * billing. Uses Ollama's `format` param (a JSON Schema) for structured
 * output instead of OpenAI's json_schema mode or Claude's forced tool-use,
 * since Ollama's /api/chat supports neither of those directly.
 */
export class OllamaProvider implements AIProvider {
  readonly name = "ollama";
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/+$/, "");
    this.model = process.env.AI_MODEL ?? "llava";
  }

  async generateStructured(params: GenerateStructuredParams): Promise<GenerateStructuredResult> {
    const jsonSchema = zodToJsonSchema(params.schema, "StageOutput");
    const format =
      ((jsonSchema as Record<string, unknown>).definitions as Record<string, unknown> | undefined)?.[
        "StageOutput"
      ] ?? jsonSchema;

    const images = (params.images ?? []).map((image) => image.data.toString("base64"));
    const messages: OllamaChatMessage[] = [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt, ...(images.length > 0 ? { images } : {}) },
    ];

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages,
          format,
          stream: false,
          // Without this, llava truncates longer structured-output fields
          // mid-sentence (reproduced during development: a text-change
          // explanation cut off after 2-3 words) — its default generation
          // length is too short for a multi-field JSON object with prose
          // fields. -1 means "no cap, bounded only by context length."
          options: { num_predict: -1 },
        }),
      });
    } catch (error) {
      throw new Error(
        `Could not reach Ollama at ${this.baseUrl}. Is "ollama serve" running? ` +
          `(${error instanceof Error ? error.message : String(error)})`,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Ollama request failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    if (data.error) {
      throw new Error(
        `Ollama returned an error: ${data.error}. If this mentions the model, run "ollama pull ${this.model}".`,
      );
    }

    const content = data.message?.content;
    if (!content) {
      throw new Error("Ollama returned an empty response.");
    }

    let raw: unknown;
    try {
      raw = normalizeConfidence(JSON.parse(content));
    } catch {
      // Let the orchestrator's schema validation reject this and retry with
      // a correction prompt rather than throwing here.
      raw = { __unparseable: content };
    }

    // Local inference — no per-call billing, so this is always free.
    return { raw, costCents: 0 };
  }
}
