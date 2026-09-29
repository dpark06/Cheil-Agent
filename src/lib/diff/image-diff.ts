import sharp from "sharp";
import pixelmatch from "pixelmatch";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageDiffResult {
  diffPixelCount: number;
  totalPixels: number;
  diffRatio: number;
  width: number;
  height: number;
  /** New-version image with differing regions highlighted in red. */
  overlayPngBuffer: Buffer;
  boundingBox: BoundingBox | null;
}

/**
 * Normalizes two page images to the same dimensions, then runs a perceptual
 * pixel diff. Used as the deterministic basis for image-change detection —
 * the AI never judges visual similarity on its own (see docs/known-gaps.md
 * and pipeline-orchestrator.ts).
 */
export async function computeImageDiff(
  previousPng: Buffer,
  newPng: Buffer,
  opts: { threshold?: number } = {},
): Promise<ImageDiffResult> {
  const [prevMeta, newMeta] = await Promise.all([
    sharp(previousPng).metadata(),
    sharp(newPng).metadata(),
  ]);
  const width = Math.max(prevMeta.width ?? 0, newMeta.width ?? 0);
  const height = Math.max(prevMeta.height ?? 0, newMeta.height ?? 0);

  const normalize = (buf: Buffer) =>
    sharp(buf)
      .resize(width, height, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .ensureAlpha()
      .raw()
      .toBuffer();

  const [prevRaw, newRaw, newNormalizedPng] = await Promise.all([
    normalize(previousPng),
    normalize(newPng),
    sharp(newPng)
      .resize(width, height, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer(),
  ]);

  const maskRaw = Buffer.alloc(width * height * 4);
  const diffPixelCount = pixelmatch(prevRaw, newRaw, maskRaw, width, height, {
    threshold: opts.threshold ?? 0.1,
    diffMask: true,
    diffColor: [255, 0, 64],
  });

  const overlayPngBuffer = await sharp(newNormalizedPng)
    .composite([{ input: maskRaw, raw: { width, height, channels: 4 }, blend: "over" }])
    .png()
    .toBuffer();

  return {
    diffPixelCount,
    totalPixels: width * height,
    diffRatio: width * height > 0 ? diffPixelCount / (width * height) : 0,
    width,
    height,
    overlayPngBuffer,
    boundingBox: computeBoundingBox(maskRaw, width, height),
  };
}

function computeBoundingBox(maskRaw: Buffer, width: number, height: number): BoundingBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = maskRaw[(y * width + x) * 4 + 3];
      if (alpha !== 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export async function cropImage(pngBuffer: Buffer, box: BoundingBox, padding = 20): Promise<Buffer> {
  const meta = await sharp(pngBuffer).metadata();
  const width = meta.width ?? box.x + box.width;
  const height = meta.height ?? box.y + box.height;

  const left = Math.max(0, box.x - padding);
  const top = Math.max(0, box.y - padding);
  const right = Math.min(width, box.x + box.width + padding);
  const bottom = Math.min(height, box.y + box.height + padding);

  return sharp(pngBuffer)
    .extract({ left, top, width: right - left, height: bottom - top })
    .png()
    .toBuffer();
}
