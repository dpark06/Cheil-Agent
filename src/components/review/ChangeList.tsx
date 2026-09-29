import type { DetectedChange } from "@prisma/client";
import { ChangeCard } from "./ChangeCard";

export function ChangeList({
  comparisonId,
  changes,
}: {
  comparisonId: string;
  changes: DetectedChange[];
}) {
  return (
    <div className="space-y-4">
      {changes.map((change) => (
        <ChangeCard key={change.id} comparisonId={comparisonId} change={change} />
      ))}
    </div>
  );
}
