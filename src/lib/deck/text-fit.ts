import { createCanvas } from "@napi-rs/canvas";

const PT_PER_INCH = 72;
const LINE_HEIGHT_MULTIPLIER = 1.25;

// pptxgenjs's own `fit: "shrink"` sets the OOXML autofit flag but bakes in
// no scale factor — per its own type docs, PowerPoint only computes that
// scale "after editing text/resize shape" in the app, so a freshly
// generated file still overflows on first open. This module computes an
// actual font size deterministically at generation time instead, the same
// "measure, don't guess" approach image-fit.ts uses for images (measured
// against a generic sans-serif since the brand typeface isn't installed in
// this environment either — see brand-theme.ts — which is also a closer
// approximation of what most real viewers will see).
const canvas = createCanvas(10, 10);
const ctx = canvas.getContext("2d");

function wrapLines(text: string, fontSizePt: number, maxWidthIn: number): string[] {
  ctx.font = `${fontSizePt}px sans-serif`;
  const maxWidthPx = maxWidthIn * PT_PER_INCH;
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;
      if (ctx.measureText(candidate).width <= maxWidthPx) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

function blockHeightIn(lineCount: number, fontSizePt: number): number {
  return (lineCount * fontSizePt * LINE_HEIGHT_MULTIPLIER) / PT_PER_INCH;
}

/**
 * Finds the largest font size (within [minFontSize, maxFontSize]) whose
 * word-wrapped text fits within boxHeightIn at boxWidthIn. Falls back to
 * minFontSize with the text truncated (word-boundary, "…" suffix) if even
 * the smallest allowed size doesn't fit — matches the product requirement
 * to shrink first, truncate only as a last resort, never overflow.
 */
export function fitText(opts: {
  text: string;
  boxWidthIn: number;
  boxHeightIn: number;
  maxFontSize: number;
  minFontSize: number;
}): { fontSize: number; text: string } {
  const { text, boxWidthIn, boxHeightIn, maxFontSize, minFontSize } = opts;
  if (!text.trim()) return { fontSize: maxFontSize, text };

  for (let size = maxFontSize; size >= minFontSize; size--) {
    const lines = wrapLines(text, size, boxWidthIn);
    if (blockHeightIn(lines.length, size) <= boxHeightIn) {
      return { fontSize: size, text };
    }
  }

  // Doesn't fit even at the minimum size — truncate to however many lines
  // actually fit, cutting the last line at a word boundary and adding "…".
  const maxLines = Math.max(1, Math.floor(boxHeightIn / blockHeightIn(1, minFontSize)));
  const allLines = wrapLines(text, minFontSize, boxWidthIn);
  if (allLines.length <= maxLines) return { fontSize: minFontSize, text };

  const kept = allLines.slice(0, maxLines);
  const lastLine = kept[kept.length - 1];
  const words = lastLine.split(/\s+/).filter(Boolean);
  words.pop();
  kept[kept.length - 1] = `${words.join(" ")}…`;
  return { fontSize: minFontSize, text: kept.join(" ").trim() };
}

/**
 * Same idea as fitText but for a bulleted list (discussion questions): each
 * item wraps independently, and if it still doesn't fit even at the
 * smallest font size, whole trailing items are dropped rather than cutting
 * mid-sentence — a partial bullet point reads as broken in a way a shorter
 * list doesn't.
 */
export function fitBulletList(opts: {
  items: string[];
  boxWidthIn: number;
  boxHeightIn: number;
  maxFontSize: number;
  minFontSize: number;
}): { fontSize: number; items: string[] } {
  const { items, boxWidthIn, boxHeightIn, maxFontSize, minFontSize } = opts;
  if (items.length === 0) return { fontSize: maxFontSize, items };

  const totalHeightAt = (size: number, list: string[]) =>
    list.reduce((sum, item) => sum + blockHeightIn(wrapLines(item, size, boxWidthIn).length, size), 0);

  for (let size = maxFontSize; size >= minFontSize; size--) {
    if (totalHeightAt(size, items) <= boxHeightIn) {
      return { fontSize: size, items };
    }
  }

  let kept = [...items];
  while (kept.length > 1 && totalHeightAt(minFontSize, kept) > boxHeightIn) {
    kept = kept.slice(0, -1);
  }
  return { fontSize: minFontSize, items: kept };
}
