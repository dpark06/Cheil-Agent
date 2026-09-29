import { createCanvas, type Canvas } from "@napi-rs/canvas";
// The legacy Node build is used outside a browser environment. As of
// pdfjs-dist 6.x it auto-detects and polyfills globalThis.Path2D/DOMMatrix
// from @napi-rs/canvas when running under Node.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { STANDARD_FONT_DATA_URL } from "./pdf-shared";

export interface RenderedPage {
  pageNumber: number;
  pngBuffer: Buffer;
  width: number;
  height: number;
}

export async function renderPdfPages(
  pdfBuffer: Buffer,
  opts: { scale?: number; maxPages?: number } = {},
): Promise<RenderedPage[]> {
  const scale = opts.scale ?? 1.5;
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    disableFontFace: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = opts.maxPages ? Math.min(pdf.numPages, opts.maxPages) : pdf.numPages;
  const pages: RenderedPage[] = [];

  try {
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));

      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        viewport,
      }).promise;

      pages.push({
        pageNumber: i,
        pngBuffer: (canvas as Canvas).toBuffer("image/png"),
        width: canvas.width,
        height: canvas.height,
      });

      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages;
}

export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdf = await loadingTask.promise;
  const count = pdf.numPages;
  await loadingTask.destroy();
  return count;
}
