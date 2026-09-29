import sharp from "sharp";
import { renderPdfPages, type RenderedPage } from "./pdf-render";
import { extractPdfText, type ExtractedPageText } from "./pdf-text-extract";

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

/**
 * Renders an uploaded source file into one or more page images. PDFs render
 * one image per page; a plain PNG/JPEG upload is itself treated as a single
 * "page" so the rest of the pipeline (text diff, image diff) doesn't need
 * to know the difference between the two input types.
 */
export async function renderSourceFile(
  buffer: Buffer,
  mimeType: string,
  opts: { maxPages?: number } = {},
): Promise<RenderedPage[]> {
  if (mimeType === "application/pdf") {
    return renderPdfPages(buffer, opts);
  }
  if (IMAGE_MIME_TYPES.has(mimeType)) {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const pngBuffer = await image.png().toBuffer();
    return [
      {
        pageNumber: 1,
        pngBuffer,
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
      },
    ];
  }
  throw new Error(`Unsupported file type for rendering: ${mimeType}`);
}

/**
 * Extracts the embedded text layer for a source file. Plain images have no
 * text layer at all — OCR (triggered downstream when character count is
 * low) is the only way text comes out of them.
 */
export async function extractSourceText(
  buffer: Buffer,
  mimeType: string,
  opts: { maxPages?: number } = {},
): Promise<ExtractedPageText[]> {
  if (mimeType === "application/pdf") {
    return extractPdfText(buffer, opts);
  }
  if (IMAGE_MIME_TYPES.has(mimeType)) {
    return [{ pageNumber: 1, text: "", charCount: 0 }];
  }
  throw new Error(`Unsupported file type for text extraction: ${mimeType}`);
}
