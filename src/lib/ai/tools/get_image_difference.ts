import { db } from "@/lib/db";

export async function get_image_difference(comparisonId: string, detectedChangeId: string) {
  const change = await db.detectedChange.findFirst({
    where: { id: detectedChangeId, comparisonId, changeType: "IMAGE" },
    select: { rawDiffData: true },
  });
  return change?.rawDiffData ?? null;
}
