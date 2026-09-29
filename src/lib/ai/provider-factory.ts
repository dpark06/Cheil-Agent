import type { AIProvider } from "./provider";
import { MockAIProvider } from "./providers/mock-provider";

let cached: AIProvider | null = null;

function createProvider(): AIProvider {
  const providerName = process.env.AI_PROVIDER ?? "mock";

  switch (providerName) {
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
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${providerName}". Supported: "mock", "openai", "anthropic", "ollama". See .env.example.`,
      );
  }
}

export function getAIProvider(): AIProvider {
  if (!cached) {
    cached = createProvider();
  }
  return cached;
}
