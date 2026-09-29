export function validateEnv(): void {
  const missing: string[] = [];

  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.AUTH_SECRET) missing.push("AUTH_SECRET");

  if (process.env.AI_PROVIDER === "openai" && !process.env.AI_API_KEY) {
    missing.push("AI_API_KEY (required because AI_PROVIDER=openai)");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. See .env.example.`,
    );
  }

  if (!process.env.ENCRYPTION_KEY) {
    console.warn(
      "[startup] ENCRYPTION_KEY is not set — uploaded files will be stored unencrypted at rest. " +
        "Set a 32-byte hex key (openssl rand -hex 32) before production use.",
    );
  } else if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY)) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes).");
  }
}
