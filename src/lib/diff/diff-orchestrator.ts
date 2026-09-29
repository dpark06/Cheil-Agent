import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getStorageAdapter } from "@/lib/storage/local-storage-adapter";
import { LIMITS } from "@/lib/config/limits";
import { renderSourceFile, extractSourceText } from "./source-file";
import { ocrImage } from "./ocr";
import { computeTextDiff } from "./text-diff";
import { computeImageDiff } from "./image-diff";

const OCR_MIN_CHAR_THRESHOLD = 20;

interface PreparedFile {
  fileAssetId: string;
  pages: { pageNumber: number; pngBuffer: Buffer; effectiveText: string; usedOcr: boolean }[];
}

async function prepareFile(
  comparisonId: string,
  fileAssetId: string,
  role: "previous" | "new",
  buffer: Buffer,
  mimeType: string,
): Promise<PreparedFile> {
  const storage = getStorageAdapter();

  const [rendered, texts] = await Promise.all([
    renderSourceFile(buffer, mimeType, { maxPages: LIMITS.maxPdfPages }),
    extractSourceText(buffer, mimeType, { maxPages: LIMITS.maxPdfPages }),
  ]);

  const pages: PreparedFile["pages"] = [];

  for (const page of rendered) {
    const extracted = texts.find((t) => t.pageNumber === page.pageNumber);
    let effectiveText = extracted?.text ?? "";
    let usedOcr = false;
    let ocrText: string | null = null;

    if (effectiveText.length < OCR_MIN_CHAR_THRESHOLD) {
      const ocrResult = await ocrImage(page.pngBuffer);
      ocrText = ocrResult.text;
      usedOcr = true;
      if (ocrResult.text.length > effectiveText.length) {
        effectiveText = ocrResult.text;
      }
    }

    const storageKey = `${comparisonId}/pages/${role}/page-${page.pageNumber}.png`;
    await storage.put(storageKey, page.pngBuffer);

    await db.extractedPage.create({
      data: {
        fileAssetId,
        pageNumber: page.pageNumber,
        renderedImagePath: storageKey,
        extractedText: extracted?.text ?? "",
        ocrText,
        usedOcr,
      },
    });

    pages.push({ pageNumber: page.pageNumber, pngBuffer: page.pngBuffer, effectiveText, usedOcr });
  }

  await db.fileAsset.update({ where: { id: fileAssetId }, data: { pageCount: pages.length } });

  return { fileAssetId, pages };
}

/**
 * Runs the full deterministic diff pipeline (render, extract, OCR fallback,
 * text diff, image diff) for a comparison and writes DetectedChange rows.
 * No AI is involved here — this is pure app code, matching the pipeline
 * design in docs/known-gaps.md (§48/§59 of the original spec).
 */
export async function processComparisonDiff(comparisonId: string): Promise<void> {
  const comparison = await db.comparison.findUniqueOrThrow({
    where: { id: comparisonId },
    include: { fileAssets: true },
  });

  const previousAsset = comparison.fileAssets.find((f) => f.role === "PREVIOUS");
  const newAsset = comparison.fileAssets.find((f) => f.role === "NEW");
  if (!previousAsset || !newAsset) {
    throw new Error(`Comparison ${comparisonId} is missing a PREVIOUS or NEW file asset`);
  }

  const storage = getStorageAdapter();
  const [previousBuffer, newBuffer] = await Promise.all([
    storage.get(previousAsset.storagePath),
    storage.get(newAsset.storagePath),
  ]);

  const [previousFile, newFile] = await Promise.all([
    prepareFile(comparisonId, previousAsset.id, "previous", previousBuffer, previousAsset.mimeType),
    prepareFile(comparisonId, newAsset.id, "new", newBuffer, newAsset.mimeType),
  ]);

  const pairedCount = Math.min(previousFile.pages.length, newFile.pages.length);

  for (let i = 0; i < pairedCount; i++) {
    const prevPage = previousFile.pages[i];
    const newPage = newFile.pages[i];
    const pageNumber = i + 1;

    const textDiff = computeTextDiff(prevPage.effectiveText, newPage.effectiveText);
    if (textDiff.hasChanges) {
      await db.detectedChange.create({
        data: {
          comparisonId,
          changeType: "TEXT",
          sourceRef: { pageNumber, previousFileAssetId: previousAsset.id, newFileAssetId: newAsset.id },
          rawDiffData: {
            addedWordCount: textDiff.addedWordCount,
            removedWordCount: textDiff.removedWordCount,
            changes: textDiff.changes,
            previousText: prevPage.effectiveText,
            newText: newPage.effectiveText,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const imageDiff = await computeImageDiff(prevPage.pngBuffer, newPage.pngBuffer);
    if (imageDiff.diffRatio > 0.001 && imageDiff.boundingBox) {
      const overlayKey = `${comparisonId}/diffs/page-${pageNumber}-overlay.png`;
      await storage.put(overlayKey, imageDiff.overlayPngBuffer);

      await db.detectedChange.create({
        data: {
          comparisonId,
          changeType: "IMAGE",
          sourceRef: { pageNumber, previousFileAssetId: previousAsset.id, newFileAssetId: newAsset.id },
          rawDiffData: {
            diffRatio: imageDiff.diffRatio,
            boundingBox: imageDiff.boundingBox,
            pageWidth: imageDiff.width,
            pageHeight: imageDiff.height,
            overlayStoragePath: overlayKey,
            previousImagePath: `${comparisonId}/pages/previous/page-${pageNumber}.png`,
            newImagePath: `${comparisonId}/pages/new/page-${pageNumber}.png`,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  for (let i = pairedCount; i < previousFile.pages.length; i++) {
    await db.detectedChange.create({
      data: {
        comparisonId,
        changeType: "REMOVED",
        sourceRef: { pageNumber: i + 1, previousFileAssetId: previousAsset.id },
        rawDiffData: { note: "Page present in previous version only" },
      },
    });
  }
  for (let i = pairedCount; i < newFile.pages.length; i++) {
    await db.detectedChange.create({
      data: {
        comparisonId,
        changeType: "ADDED",
        sourceRef: { pageNumber: i + 1, newFileAssetId: newAsset.id },
        rawDiffData: { note: "Page present in new version only" },
      },
    });
  }

  await db.comparison.update({ where: { id: comparisonId }, data: { status: "DIFFED" } });
}
