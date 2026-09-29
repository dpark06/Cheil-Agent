import { db } from "@/lib/db";

export async function get_selected_file_metadata(comparisonId: string) {
  return db.fileAsset.findMany({
    where: { comparisonId },
    select: {
      id: true,
      role: true,
      originalName: true,
      pageCount: true,
      mimeType: true,
      sizeBytes: true,
    },
  });
}
