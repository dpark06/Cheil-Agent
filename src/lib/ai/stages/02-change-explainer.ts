import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  changeExplainerOutputSchema,
  type ChangeExplainerOutput,
} from "../schemas/change-explainer.schema";
import { runStage } from "../run-stage";
import type { AIImageInput } from "../provider";
import { assertWithinCostLimit, recordAiSpend } from "../cost-control";
import { read_extracted_text } from "../tools/read_extracted_text";
import { get_image_crop } from "../tools/get_image_crop";
import { cleanAndCapSummary } from "../sanitize-text";

const SYSTEM_PROMPT = `You are the Change Explainer stage of Cheil Delta. You are given one classified change between a previous and new version of a creative document. Write a clear, plain-language explanation for a non-technical reviewer.

observedDifference is the single most important field: it must be ONE short, scannable sentence (aim for well under 25 words) stating what visibly changed, in your own plain words — not a paragraph, not a list, not multiple sentences. Describe the nature of the change (what kind of content, what element, what direction) rather than transcribing it — do not quote raw source text verbatim, especially if the underlying extracted text looks garbled, broken, or contains stray symbols (that's a common OCR/extraction artifact, not meaningful content — describe around it, don't reproduce it). Never include markdown formatting, asterisks, backticks, pipes, or other stray symbols — plain prose only. Banned phrases: "some changes were made", "content was updated", "various elements changed" — say what specifically changed, briefly.

For visual changes: name the specific region of the page (e.g. "the logo in the top-left corner", "the call-to-action button") and what kind of change it looks like (color, position, size, replaced asset, subject matter) — still one short sentence.

You MUST separate objective observation (observedDifference: what visibly changed, stated as fact only when directly supported by the given diff data or image) from interpretation (possibleSignificance: why it might matter, always phrased as a possibility — this one can be a bit longer). If you are not confident, set needsHumanConfirmation to true. Output must match the required JSON schema exactly.`;

interface TextChangeSegment {
  value: string;
  added?: boolean;
  removed?: boolean;
}

interface TextRawDiff {
  previousText?: string;
  newText?: string;
  addedWordCount: number;
  removedWordCount: number;
  changes?: TextChangeSegment[];
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageRawDiff {
  diffRatio: number;
  boundingBox?: BoundingBox;
  pageWidth?: number;
  pageHeight?: number;
}

export async function explainChange(
  comparisonId: string,
  detectedChangeId: string,
): Promise<ChangeExplainerOutput> {
  await assertWithinCostLimit(comparisonId);

  const change = await db.detectedChange.findUniqueOrThrow({ where: { id: detectedChangeId } });
  const sourceRef = change.sourceRef as {
    pageNumber?: number;
    previousFileAssetId?: string;
    newFileAssetId?: string;
  };

  let contextBlock = `Classifier output: ${JSON.stringify(change.classifierOutput)}\nRaw diff: ${JSON.stringify(change.rawDiffData).slice(0, 3000)}`;
  const images: AIImageInput[] = [];

  if (
    change.changeType === "TEXT" &&
    sourceRef.previousFileAssetId &&
    sourceRef.newFileAssetId &&
    sourceRef.pageNumber
  ) {
    const [prevText, newText] = await Promise.all([
      read_extracted_text(comparisonId, sourceRef.previousFileAssetId, sourceRef.pageNumber),
      read_extracted_text(comparisonId, sourceRef.newFileAssetId, sourceRef.pageNumber),
    ]);
    contextBlock += `\nPrevious page text: ${prevText?.text ?? ""}\nNew page text: ${newText?.text ?? ""}`;
  }

  let imageInstruction = "";
  if (change.changeType === "IMAGE") {
    const crops = await get_image_crop(comparisonId, detectedChangeId);
    if (crops) {
      images.push({ data: crops.previous, mimeType: "image/png" });
      images.push({ data: crops.new, mimeType: "image/png" });
      imageInstruction =
        "\n\nImage 1 is the PREVIOUS version of the changed region; Image 2 is the NEW version of the same region. " +
        "Actually look at and identify the content of both images (what real-world object, scene, text, or graphic is depicted) " +
        "before describing the difference — do not describe only position/size/color if the visible subject matter itself changed " +
        "(e.g. an element present in one image and absent in the other).";
    }
  }

  const { data, costCents } = await runStage({
    schema: changeExplainerOutputSchema,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `${contextBlock}${imageInstruction}\n\nExplain this change.`,
    images,
    mockFallback: () => mockExplain(change.changeType, change.rawDiffData),
  });

  // The schema's max(180) on observedDifference is a soft ceiling — it
  // triggers a retry, but a weaker/local provider can still exhaust its
  // retries producing something long-winded, or (separately) get cut off
  // mid-sentence by its own context limits. This is the deterministic
  // guarantee that what a reviewer actually sees is always short and
  // clean, regardless of what the model produced.
  const finalData: ChangeExplainerOutput = {
    ...data,
    observedDifference: cleanAndCapSummary(data.observedDifference),
  };

  await recordAiSpend(comparisonId, costCents);
  await db.detectedChange.update({
    where: { id: detectedChangeId },
    data: { explainerOutput: finalData as unknown as Prisma.InputJsonValue },
  });

  return finalData;
}

function summarizeTextChanges(changes: TextChangeSegment[] | undefined): {
  added: string[];
  removed: string[];
} {
  const added: string[] = [];
  const removed: string[] = [];
  for (const segment of changes ?? []) {
    const trimmed = segment.value.trim();
    if (!trimmed) continue;
    if (segment.added) added.push(trimmed);
    else if (segment.removed) removed.push(trimmed);
  }
  return { added, removed };
}

/** Coarse 3x3-grid region name, e.g. "top-left area", used when we have no
 * real visual understanding (mock provider) but do have the bounding box. */
function describeRegion(box: BoundingBox | undefined, pageWidth?: number, pageHeight?: number): string {
  if (!box || !pageWidth || !pageHeight) return "this page";
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const horiz = centerX < pageWidth / 3 ? "left" : centerX > (pageWidth * 2) / 3 ? "right" : "center";
  const vert = centerY < pageHeight / 3 ? "top" : centerY > (pageHeight * 2) / 3 ? "bottom" : "middle";
  if (horiz === "center" && vert === "middle") return "the center of the page";
  return `the ${vert}-${horiz} area of the page`.replace("middle-", "");
}

function mockExplain(changeType: string, rawDiffData: unknown): ChangeExplainerOutput {
  if (changeType === "TEXT") {
    const raw = rawDiffData as TextRawDiff;
    const { added, removed } = summarizeTextChanges(raw.changes);
    // Character-level diffing can produce fragment segments as short as a
    // single character ("4", "i", "["), which are diff noise, not content —
    // quoting them is exactly the "random symbols" problem this fixes.
    // Only quote a segment if it reads as an actual word/phrase, and never
    // more than one per side — a growing ", +104 more" tail is itself the
    // clutter this is supposed to avoid, not a feature.
    const isMeaningful = (s: string) => s.length >= 3 && /[a-zA-Z]/.test(s);
    const addedWord = added.find(isMeaningful);
    const removedWord = removed.find(isMeaningful);

    let observedDifference: string;
    if (removedWord && addedWord) {
      observedDifference = `Text changed from "${removedWord}" to "${addedWord}" on this page.`;
    } else if (addedWord) {
      observedDifference = `Text added on this page: "${addedWord}".`;
    } else if (removedWord) {
      observedDifference = `Text removed from this page: "${removedWord}".`;
    } else {
      observedDifference = `${raw.addedWordCount} word(s) added, ${raw.removedWordCount} word(s) removed on this page.`;
    }

    return {
      previousDescription: (raw.previousText ?? "").slice(0, 300) || "(no previous text)",
      newDescription: (raw.newText ?? "").slice(0, 300) || "(no new text)",
      observedDifference,
      possibleSignificance:
        "This may reflect an updated messaging or targeting decision — confirm with the strategy team.",
      confidence: 0.5,
      needsHumanConfirmation: true,
    };
  }
  if (changeType === "IMAGE") {
    const raw = rawDiffData as ImageRawDiff;
    const region = describeRegion(raw.boundingBox, raw.pageWidth, raw.pageHeight);
    const dimensions = raw.boundingBox
      ? `, approximately ${Math.round(raw.boundingBox.width)}x${Math.round(raw.boundingBox.height)}px`
      : "";
    return {
      previousDescription: `Previous version of ${region}.`,
      newDescription: `New version of ${region}.`,
      observedDifference: `A visual change was detected in ${region} (about ${(raw.diffRatio * 100).toFixed(1)}% of the page${dimensions}).`,
      possibleSignificance:
        `This could be a layout, color, or asset change in ${region} — confirm with the design team which specific element moved, resized, or was replaced.`,
      confidence: 0.5,
      needsHumanConfirmation: true,
    };
  }
  return {
    previousDescription: "N/A",
    newDescription: "N/A",
    observedDifference: changeType === "ADDED" ? "A page was added." : "A page was removed.",
    possibleSignificance: "Confirm whether this was intentional.",
    confidence: 0.6,
    needsHumanConfirmation: true,
  };
}
