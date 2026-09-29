function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const LIMITS = {
  maxFileSizeBytes: envInt("MAX_FILE_SIZE_MB", 50) * 1024 * 1024,
  maxFilesPerComparison: envInt("MAX_FILES_PER_COMPARISON", 10),
  maxPdfPages: envInt("MAX_PDF_PAGES", 100),
  maxAiCostCentsPerSession: envInt("MAX_AI_COST_CENTS_PER_SESSION", 200),
  fileRetentionHours: envInt("FILE_RETENTION_HOURS", 24),
  maxUploadsPerHour: envInt("MAX_UPLOADS_PER_HOUR", 20),
};
