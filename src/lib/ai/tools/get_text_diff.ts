import { db } from "@/lib/db";

export async function get_text_diff(comparisonId: string, detectedChangeId: string) {
  const change = await db.detectedChange.findFirst({
    where: { id: detectedChangeId, comparisonId, changeType: "TEXT" },
    select: { rawDiffData: true },
  });
  return change?.rawDiffData ?? null;
}
