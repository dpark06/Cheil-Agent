import { db } from "@/lib/db";

export async function read_extracted_text(
  comparisonId: string,
  fileAssetId: string,
  pageNumber: number,
): Promise<{ text: string; usedOcr: boolean } | null> {
  const page = await db.extractedPage.findFirst({
    where: { pageNumber, fileAsset: { id: fileAssetId, comparisonId } },
    select: { extractedText: true, ocrText: true, usedOcr: true },
  });
  if (!page) return null;

  const text = page.usedOcr && page.ocrText ? page.ocrText : (page.extractedText ?? "");
  return { text, usedOcr: page.usedOcr };
}
