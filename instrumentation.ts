export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./src/lib/env-validation");
    validateEnv();
  }
}
