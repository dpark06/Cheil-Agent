import { db } from "@/lib/db";

/**
 * Returns only CONFIRMED/EDITED changes — this is what structurally keeps
 * rejected/minor changes out of the deck planner (stage 4), not a UI filter.
 */
export async function list_confirmed_changes(comparisonId: string) {
  return db.detectedChange.findMany({
    where: { comparisonId, reviewStatus: { in: ["CONFIRMED", "EDITED"] } },
    orderBy: { createdAt: "asc" },
  });
}
