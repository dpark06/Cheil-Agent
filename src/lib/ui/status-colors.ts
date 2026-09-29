/**
 * Semantic status -> brand color mappings, shared across the dashboard,
 * comparison status page, and review page so a given status always reads
 * the same color everywhere.
 */
export const COMPARISON_STATUS_STYLES: Record<string, string> = {
  UPLOADING: "bg-morning-sky text-harbor-blue",
  PROCESSING: "bg-morning-sky text-harbor-blue",
  DIFFED: "bg-morning-sky text-harbor-blue",
  AI_PROCESSING: "bg-morning-sky text-harbor-blue",
  READY_FOR_REVIEW: "bg-sunlight text-black",
  APPROVED: "bg-celadon text-black",
  GENERATING_DECK: "bg-morning-sky text-harbor-blue",
  COMPLETE: "bg-celadon text-black",
  FAILED: "bg-pulse/10 text-pulse",
};

export const REVIEW_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-sunlight text-black",
  CONFIRMED: "bg-celadon text-black",
  EDITED: "bg-morning-sky text-harbor-blue",
  REJECTED: "bg-pulse/10 text-pulse",
  MINOR: "bg-stone text-black",
};
