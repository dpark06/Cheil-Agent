import { db } from "@/lib/db";
import { getStorageAdapter } from "@/lib/storage/local-storage-adapter";
import { cropImage, type BoundingBox } from "@/lib/diff/image-diff";

interface ImageDiffRawData {
  boundingBox: BoundingBox;
  previousImagePath: string;
  newImagePath: string;
}

/**
 * Crops the changed region out of BOTH the previous and new page renders —
 * a vision model can only actually compare two versions (e.g. "a window is
 * missing now") if it's given both images, not just the new one.
 */
export async function get_image_crop(
  comparisonId: string,
  detectedChangeId: string,
): Promise<{ previous: Buffer; new: Buffer } | null> {
  const change = await db.detectedChange.findFirst({
    where: { id: detectedChangeId, comparisonId, changeType: "IMAGE" },
    select: { rawDiffData: true },
  });
  if (!change) return null;

  const raw = change.rawDiffData as unknown as ImageDiffRawData;
  const storage = getStorageAdapter();
  const [previousImage, newImage] = await Promise.all([
    storage.get(raw.previousImagePath),
    storage.get(raw.newImagePath),
  ]);
  const [previousCrop, newCrop] = await Promise.all([
    cropImage(previousImage, raw.boundingBox),
    cropImage(newImage, raw.boundingBox),
  ]);
  return { previous: previousCrop, new: newCrop };
}
