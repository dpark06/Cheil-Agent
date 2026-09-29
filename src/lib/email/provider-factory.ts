import type { EmailProvider } from "./provider";
import { ConsoleEmailProvider } from "./providers/console-provider";

let cached: EmailProvider | null = null;

function createProvider(): EmailProvider {
  const providerName = process.env.EMAIL_PROVIDER ?? "console";

  switch (providerName) {
    case "console":
      return new ConsoleEmailProvider();
    case "smtp": {
      const { SmtpEmailProvider } = require("./providers/smtp-provider");
      return new SmtpEmailProvider();
    }
    default:
      throw new Error(
        `Unknown EMAIL_PROVIDER "${providerName}". Supported: "console", "smtp". See .env.example.`,
      );
  }
}

export function getEmailProvider(): EmailProvider {
  if (!cached) {
    cached = createProvider();
  }
  return cached;
}
