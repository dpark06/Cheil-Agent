import { z } from "zod";
import { LIMITS } from "@/lib/config/limits";

// PPTX/DOCX are not accepted directly in this MVP — the diff pipeline renders
// pages from PDFs. Users export source decks to PDF first (see docs/known-gaps.md).
export const ACCEPTED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;

export const EXTENSIONS_BY_MIME: Record<(typeof ACCEPTED_MIME_TYPES)[number], string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

export const fileUploadMetaSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.enum(ACCEPTED_MIME_TYPES, {
    errorMap: () => ({ message: "Unsupported file type. Allowed: PDF, PNG, JPEG." }),
  }),
  size: z
    .number()
    .int()
    .positive()
    .max(LIMITS.maxFileSizeBytes, {
      message: `File exceeds the maximum size of ${Math.round(LIMITS.maxFileSizeBytes / (1024 * 1024))}MB`,
    }),
});

export type FileUploadMeta = z.infer<typeof fileUploadMetaSchema>;

export function validateFileUploadMeta(meta: { name: string; type: string; size: number }) {
  return fileUploadMetaSchema.safeParse(meta);
}
