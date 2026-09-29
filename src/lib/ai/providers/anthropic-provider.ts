import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AIProvider, GenerateStructuredParams, GenerateStructuredResult } from "../provider";

// Rough per-1K-token pricing in cents, used only for the cost cap in
// cost-control.ts — not billing-accurate, intentionally conservative
// (rounds up) so MAX_AI_COST_CENTS_PER_SESSION triggers before real spend
// would exceed it. Update alongside AI_MODEL in .env.
const PRICE_CENTS_PER_1K_INPUT = 0.3;
const PRICE_CENTS_PER_1K_OUTPUT = 1.5;

const TOOL_NAME = "emit_stage_output";

function toAnthropicImageMediaType(mimeType: string): "image/png" | "image/jpeg" | "image/gif" | "image/webp" {
  if (mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/gif" || mimeType === "image/webp") {
    return mimeType;
  }
  // The only image types this app's pipeline ever produces (sharp-rendered
  // PNG crops/pages) — anything else is a programmer error upstream, not a
  // case to silently coerce.
  throw new Error(`Unsupported image mimeType for Claude vision: ${mimeType}`);
}

/**
 * Claude has no OpenAI-style `response_format: json_schema` mode. The
 * documented way to get reliable structured output is to define a single
 * tool matching the schema and force its use via `tool_choice` — the
 * model's tool call input IS the JSON we want, no free-text parsing needed.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    // Provider-specific env vars take priority so this can run alongside
    // another provider under AI_PROVIDER=fallback (see fallback-provider.ts)
    // without both providers fighting over one generic AI_API_KEY/AI_MODEL.
    const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.AI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY (or AI_API_KEY) is required when AI_PROVIDER=anthropic or anthropic is in AI_FALLBACK_ORDER.",
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = opts?.model ?? process.env.ANTHROPIC_MODEL ?? process.env.AI_MODEL ?? "claude-sonnet-4-5-20250929";
  }

  async generateStructured(params: GenerateStructuredParams): Promise<GenerateStructuredResult> {
    const jsonSchema = zodToJsonSchema(params.schema, "StageOutput");
    const inputSchema = ((jsonSchema as Record<string, unknown>).definitions as Record<string, unknown> | undefined)?.[
      "StageOutput"
    ] ?? jsonSchema;

    const content: Anthropic.Messages.ContentBlockParam[] = [];
    const images = params.images ?? [];
    images.forEach((image, i) => {
      if (images.length > 1) {
        content.push({ type: "text", text: `Image ${i + 1} of ${images.length}:` });
      }
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: toAnthropicImageMediaType(image.mimeType),
          data: image.data.toString("base64"),
        },
      });
    });
    content.push({ type: "text", text: params.userPrompt });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: params.systemPrompt,
      messages: [{ role: "user", content }],
      tools: [
        {
          name: TOOL_NAME,
          description: "Emit this stage's structured output. Always call this tool exactly once with the complete result.",
          input_schema: inputSchema as Anthropic.Messages.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error("Claude did not return a tool_use block for the forced structured-output tool.");
    }

    const usage = response.usage;
    const costCents = usage
      ? (usage.input_tokens / 1000) * PRICE_CENTS_PER_1K_INPUT +
        (usage.output_tokens / 1000) * PRICE_CENTS_PER_1K_OUTPUT
      : 0;

    return { raw: toolUse.input, costCents };
  }
}
