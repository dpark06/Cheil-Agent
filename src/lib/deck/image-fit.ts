import sharp from "sharp";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Computes an aspect-ratio-preserving "contain" placement for an image
 * inside a fixed box: the image is scaled down to fit entirely within the
 * box (never cropped, never stretched) and centered, leaving whitespace
 * (letterboxing) on whichever axis is shorter.
 *
 * pptxgenjs's own `sizing: { type: "contain" }` option cannot be used for
 * this: it infers the source image's aspect ratio from the placeholder
 * frame's own width/height rather than the image's real pixel dimensions
 * (see the commented-out `getSizeFromImage` call in its source), so when the
 * frame and the sizing box match — the normal case — it silently degrades
 * to a full stretch. Computing the fit ourselves and passing explicit
 * x/y/w/h avoids that bug entirely.
 */
export function computeContainRect(imageWidthPx: number, imageHeightPx: number, box: Rect): Rect {
  const imageRatio = imageWidthPx / imageHeightPx;
  const boxRatio = box.w / box.h;

  let w: number;
  let h: number;
  if (imageRatio > boxRatio) {
    w = box.w;
    h = box.w / imageRatio;
  } else {
    h = box.h;
    w = box.h * imageRatio;
  }

  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w,
    h,
  };
}

export async function getImageNaturalSize(buffer: Buffer): Promise<{ width: number; height: number }> {
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Could not determine image dimensions for contain-fit placement.");
  }
  return { width: metadata.width, height: metadata.height };
}
