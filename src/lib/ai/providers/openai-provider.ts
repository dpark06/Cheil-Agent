import OpenAI from "openai";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AIProvider, GenerateStructuredParams, GenerateStructuredResult } from "../provider";

// Rough per-1K-token pricing in cents, used only for the cost cap in
// cost-control.ts — not billing-accurate, intentionally conservative
// (rounds up) so MAX_AI_COST_CENTS_PER_SESSION triggers before real spend
// would exceed it. Update alongside AI_MODEL in .env.
const PRICE_CENTS_PER_1K_INPUT = 0.15;
const PRICE_CENTS_PER_1K_OUTPUT = 0.6;

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      throw new Error("AI_API_KEY is required when AI_PROVIDER=openai.");
    }
    this.client = new OpenAI({ apiKey });
    this.model = process.env.AI_MODEL ?? "gpt-4o-mini";
  }

  async generateStructured(params: GenerateStructuredParams): Promise<GenerateStructuredResult> {
    const jsonSchema = zodToJsonSchema(params.schema, "StageOutput");

    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: params.userPrompt },
    ];
    for (const image of params.images ?? []) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${image.mimeType};base64,${image.data.toString("base64")}` },
      });
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "StageOutput", schema: jsonSchema as Record<string, unknown>, strict: false },
      },
    });

    const message = response.choices[0]?.message?.content;
    if (!message) {
      throw new Error("OpenAI returned an empty response.");
    }

    const usage = response.usage;
    const costCents = usage
      ? (usage.prompt_tokens / 1000) * PRICE_CENTS_PER_1K_INPUT +
        (usage.completion_tokens / 1000) * PRICE_CENTS_PER_1K_OUTPUT
      : 0;

    let raw: unknown;
    try {
      raw = JSON.parse(message);
    } catch {
      // Let the orchestrator's schema validation reject this and retry with
      // a correction prompt rather than throwing here.
      raw = { __unparseable: message };
    }

    return { raw, costCents };
  }
}
