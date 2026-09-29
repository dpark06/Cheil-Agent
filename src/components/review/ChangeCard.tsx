import type { DetectedChange } from "@prisma/client";
import { TextDiffView } from "@/components/diff-viewer/TextDiffView";
import { ImageDiffOverlay } from "@/components/diff-viewer/ImageDiffOverlay";
import { ApprovalControls } from "./ApprovalControls";
import { REVIEW_STATUS_STYLES } from "@/lib/ui/status-colors";

interface ExplainerOutput {
  previousDescription?: string;
  newDescription?: string;
  observedDifference?: string;
  possibleSignificance?: string;
  needsHumanConfirmation?: boolean;
}

interface ClassifierOutput {
  category?: string;
  confidence?: number;
}

export function ChangeCard({
  comparisonId,
  change,
}: {
  comparisonId: string;
  change: DetectedChange;
}) {
  const explainer = change.explainerOutput as ExplainerOutput | null;
  const classifier = change.classifierOutput as ClassifierOutput | null;
  const sourceRef = change.sourceRef as { pageNumber?: number };
  const rawDiffData = change.rawDiffData as { changes?: Array<{ value: string; added?: boolean; removed?: boolean }> };

  return (
    <div className="rounded-lg border border-stone bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded bg-samsung-blue px-2 py-0.5 text-xs font-medium text-white">
            {change.changeType}
          </span>
          {classifier?.category && (
            <span className="rounded bg-morning-sky px-2 py-0.5 text-xs text-harbor-blue">
              {classifier.category}
            </span>
          )}
          <span className="text-xs text-black/50">Page {sourceRef.pageNumber ?? "?"}</span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${REVIEW_STATUS_STYLES[change.reviewStatus] ?? "bg-stone text-black"}`}
        >
          {change.reviewStatus}
        </span>
      </div>

      {change.changeType === "IMAGE" && (
        <ImageDiffOverlay comparisonId={comparisonId} changeId={change.id} />
      )}
      {change.changeType === "TEXT" && rawDiffData?.changes && (
        <div className="rounded-md bg-morning-sky p-3">
          <TextDiffView changes={rawDiffData.changes} />
        </div>
      )}

      {explainer && (
        <div className="mt-4 space-y-2 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-black/40">Observed</p>
            <p className="text-black">{change.editedExplanation || explainer.observedDifference}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-black/40">
              Possible significance — AI interpretation, confirm before trusting
            </p>
            <p className="italic text-black/70">{explainer.possibleSignificance}</p>
          </div>
        </div>
      )}

      <ApprovalControls
        comparisonId={comparisonId}
        changeId={change.id}
        initialExplanation={change.editedExplanation ?? explainer?.observedDifference ?? ""}
      />
    </div>
  );
}
