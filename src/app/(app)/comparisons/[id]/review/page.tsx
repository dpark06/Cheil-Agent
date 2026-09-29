import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ChangeList } from "@/components/review/ChangeList";
import { GenerateDeckButton } from "./GenerateDeckButton";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const comparison = await db.comparison.findUnique({
    where: { id },
    include: {
      detectedChanges: { orderBy: [{ createdAt: "asc" }] },
      presentationSession: { select: { id: true } },
    },
  });

  if (!comparison) notFound();
  if (comparison.ownerId !== session!.user.id && session!.user.role !== "ADMIN") notFound();

  const pendingCount = comparison.detectedChanges.filter((c) => c.reviewStatus === "PENDING").length;
  const ready = comparison.detectedChanges.length > 0 && pendingCount === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-black">{comparison.title}</h2>
          <p className="mt-1 text-sm text-black/50">
            {comparison.detectedChanges.length} change(s) detected — {pendingCount} pending review
          </p>
        </div>
        <GenerateDeckButton
          comparisonId={comparison.id}
          ready={ready}
          hasExistingDeck={Boolean(comparison.presentationSession)}
        />
      </div>

      {comparison.detectedChanges.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone bg-white p-10 text-center text-sm text-black/50">
          No changes to review yet.
        </div>
      ) : (
        <ChangeList comparisonId={comparison.id} changes={comparison.detectedChanges} />
      )}
    </div>
  );
}
