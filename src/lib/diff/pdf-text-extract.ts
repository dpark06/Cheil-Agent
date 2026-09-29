import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { STANDARD_FONT_DATA_URL } from "./pdf-shared";

export interface ExtractedPageText {
  pageNumber: number;
  text: string;
  /** Character count of the extractable text layer, used to decide whether OCR is needed. */
  charCount: number;
}

export async function extractPdfText(
  pdfBuffer: Buffer,
  opts: { maxPages?: number } = {},
): Promise<ExtractedPageText[]> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  });
  const pdf = await loadingTask.promise;
  const numPages = opts.maxPages ? Math.min(pdf.numPages, opts.maxPages) : pdf.numPages;
  const results: ExtractedPageText[] = [];

  try {
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      let text = "";
      for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
        if (typeof item.str !== "string") continue;
        text += item.str;
        text += item.hasEOL ? "\n" : " ";
      }
      text = text.replace(/[ \t]+\n/g, "\n").trim();

      results.push({ pageNumber: i, text, charCount: text.length });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return results;
}
