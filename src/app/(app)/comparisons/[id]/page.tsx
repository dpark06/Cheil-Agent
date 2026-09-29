import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StatusPoller } from "@/components/StatusPoller";
import { ProgressBar } from "@/components/ProgressBar";
import { REVIEW_STATUS_STYLES } from "@/lib/ui/status-colors";
import {
  DECK_GENERATION_STAGE_LABELS,
  DECK_GENERATION_STAGE_PERCENT,
  type DeckGenerationStage,
} from "@/lib/deck/generation-stages";

const STATUS_LABEL: Record<string, string> = {
  UPLOADING: "Uploading",
  PROCESSING: "Processing files (rendering, text extraction, diffing)",
  DIFFED: "Differences detected — waiting on AI analysis",
  AI_PROCESSING: "AI analyzing changes",
  READY_FOR_REVIEW: "Ready for your review",
  APPROVED: "Approved",
  GENERATING_DECK: "Generating presentation",
  COMPLETE: "Complete",
  FAILED: "Failed",
};

const IN_PROGRESS_STATUSES = new Set(["UPLOADING", "PROCESSING", "DIFFED", "AI_PROCESSING", "GENERATING_DECK"]);

function isKnownStage(stage: string | null): stage is DeckGenerationStage {
  return stage !== null && stage in DECK_GENERATION_STAGE_LABELS;
}

/**
 * Computes what the progress bar should show for whichever in-progress
 * status the comparison is currently in. AI_PROCESSING and GENERATING_DECK
 * have a real countable signal (processedCount/totalCount, or a known
 * fixed-order stage) so they get a determinate fill; UPLOADING/PROCESSING/
 * DIFFED are fast, non-AI, CPU-bound phases with no cheap way to measure
 * partial progress, so they stay indeterminate — same fallback the original
 * deck-generation bar used, just now applied consistently everywhere.
 */
function progressFor(comparison: {
  status: string;
  deckGenerationStage: string | null;
  processedCount: number | null;
  totalCount: number | null;
}): { label: string; percent?: number } {
  if (comparison.status === "GENERATING_DECK") {
    const stage = comparison.deckGenerationStage;
    return isKnownStage(stage)
      ? { label: DECK_GENERATION_STAGE_LABELS[stage], percent: DECK_GENERATION_STAGE_PERCENT[stage] }
      : { label: STATUS_LABEL.GENERATING_DECK };
  }
  if (comparison.status === "AI_PROCESSING") {
    const { processedCount, totalCount } = comparison;
    if (processedCount !== null && totalCount) {
      return {
        label: `Analyzing changes with AI (${processedCount} of ${totalCount})`,
        percent: (processedCount / totalCount) * 100,
      };
    }
    return { label: STATUS_LABEL.AI_PROCESSING };
  }
  return { label: STATUS_LABEL[comparison.status] ?? comparison.status };
}

export default async function ComparisonStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const comparison = await db.comparison.findUnique({
    where: { id },
    include: {
      fileAssets: true,
      detectedChanges: { orderBy: [{ changeType: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!comparison) notFound();
  if (comparison.ownerId !== session!.user.id && session!.user.role !== "ADMIN") notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <StatusPoller
        comparisonId={comparison.id}
        currentStatus={comparison.status}
        currentStage={comparison.deckGenerationStage}
        currentProcessedCount={comparison.processedCount}
      />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-black">{comparison.title}</h2>
          <p className="mt-1 text-sm text-black/50">
            Created {new Date(comparison.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          {["READY_FOR_REVIEW", "APPROVED", "GENERATING_DECK", "COMPLETE"].includes(
            comparison.status,
          ) && (
            <Link
              href={`/comparisons/${comparison.id}/review`}
              className="rounded-md border border-stone px-4 py-2 text-sm font-medium text-black hover:bg-morning-sky"
            >
              Review changes
            </Link>
          )}
          {comparison.status === "COMPLETE" && (
            <Link
              href={`/comparisons/${comparison.id}/deck`}
              className="rounded-md bg-samsung-blue px-4 py-2 text-sm font-medium text-white hover:bg-harbor-blue"
            >
              View deck
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-stone bg-white p-5">
        <p className="text-sm font-medium text-black">Status</p>
        {IN_PROGRESS_STATUSES.has(comparison.status) ? (
          <ProgressBar {...progressFor(comparison)} />
        ) : (
          <p className="mt-1 text-sm text-black/70">
            {STATUS_LABEL[comparison.status] ?? comparison.status}
          </p>
        )}
        {comparison.errorMessage && (
          <p className="mt-2 rounded-md bg-pulse/10 px-3 py-2 text-sm text-pulse">
            {comparison.errorMessage}
          </p>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-stone bg-white p-5">
        <p className="mb-3 text-sm font-medium text-black">Files</p>
        <ul className="space-y-2 text-sm text-black/70">
          {comparison.fileAssets.map((f) => (
            <li key={f.id} className="flex items-center justify-between">
              <span>
                <span className="font-medium text-black">{f.role}</span>: {f.originalName}
              </span>
              <span className="text-xs text-black/40">
                {Math.round(f.sizeBytes / 1024)} KB
              </span>
            </li>
          ))}
        </ul>
      </div>

      {comparison.detectedChanges.length > 0 && (
        <div className="mt-6 rounded-lg border border-stone bg-white p-5">
          <p className="mb-3 text-sm font-medium text-black">
            Detected changes ({comparison.detectedChanges.length})
          </p>
          <ul className="space-y-2 text-sm text-black/70">
            {comparison.detectedChanges.map((c) => {
              const ref = c.sourceRef as { pageNumber?: number };
              return (
                <li key={c.id} className="flex items-center justify-between">
                  <span>
                    <span className="rounded bg-morning-sky px-2 py-0.5 text-xs font-medium text-harbor-blue">
                      {c.changeType}
                    </span>{" "}
                    Page {ref.pageNumber ?? "?"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${REVIEW_STATUS_STYLES[c.reviewStatus] ?? "bg-stone text-black"}`}
                  >
                    {c.reviewStatus}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
