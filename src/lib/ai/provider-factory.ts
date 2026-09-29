import type { AIProvider } from "./provider";
import { MockAIProvider } from "./providers/mock-provider";

let cached: AIProvider | null = null;

const NAMED_PROVIDERS = ["mock", "openai", "anthropic", "ollama"] as const;
type NamedProvider = (typeof NAMED_PROVIDERS)[number];

/** Builds one concrete provider by name — shared by the direct AI_PROVIDER
 * cases and by the "fallback" case, which builds several of these to chain. */
function buildNamedProvider(name: NamedProvider): AIProvider {
  switch (name) {
    case "mock":
      return new MockAIProvider();
    case "openai": {
      const { OpenAIProvider } = require("./providers/openai-provider");
      return new OpenAIProvider();
    }
    case "anthropic": {
      const { AnthropicProvider } = require("./providers/anthropic-provider");
      return new AnthropicProvider();
    }
    case "ollama": {
      const { OllamaProvider } = require("./providers/ollama-provider");
      return new OllamaProvider();
    }
  }
}

function createProvider(): AIProvider {
  const providerName = process.env.AI_PROVIDER ?? "mock";

  if (providerName === "fallback") {
    const { FallbackAIProvider } = require("./providers/fallback-provider");
    const order = (process.env.AI_FALLBACK_ORDER ?? "anthropic,openai")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (order.length === 0) {
      throw new Error("AI_FALLBACK_ORDER must list at least one provider when AI_PROVIDER=fallback.");
    }
    const providers = order.map((name) => {
      if (!(NAMED_PROVIDERS as readonly string[]).includes(name)) {
        throw new Error(
          `Unknown provider "${name}" in AI_FALLBACK_ORDER. Supported: ${NAMED_PROVIDERS.join(", ")}.`,
        );
      }
      return buildNamedProvider(name as NamedProvider);
    });
    return new FallbackAIProvider(providers);
  }

  if (!(NAMED_PROVIDERS as readonly string[]).includes(providerName)) {
    throw new Error(
      `Unknown AI_PROVIDER "${providerName}". Supported: "fallback", ${NAMED_PROVIDERS.join(", ")}. See .env.example.`,
    );
  }
  return buildNamedProvider(providerName as NamedProvider);
}

export function getAIProvider(): AIProvider {
  if (!cached) {
    cached = createProvider();
  }
  return cached;
}
