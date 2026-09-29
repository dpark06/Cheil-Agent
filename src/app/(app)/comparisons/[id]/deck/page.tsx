import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DeckPreview } from "@/components/deck/DeckPreview";
import type { ReviewDeckPlan } from "@/lib/ai/schemas/review-deck-planner.schema";

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const comparison = await db.comparison.findUnique({
    where: { id },
    include: {
      presentationSession: true,
      deckVersions: {
        orderBy: { versionNumber: "desc" },
        include: { generatedBy: { select: { name: true, email: true } } },
      },
    },
  });

  if (!comparison) notFound();
  if (comparison.ownerId !== session!.user.id && session!.user.role !== "ADMIN") notFound();

  const presentation = comparison.presentationSession;
  const currentVersionNumber = comparison.deckVersions[0]?.versionNumber;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-black">{comparison.title}</h2>
          <p className="mt-1 text-sm text-black/50">
            {presentation?.slideCount
              ? `${presentation.slideCount} slides`
              : "Presentation not yet generated"}
          </p>
        </div>
        {presentation?.pptxStoragePath && (
          <a
            href={`/api/comparisons/${comparison.id}/deck`}
            className="rounded-md bg-samsung-blue px-4 py-2 text-sm font-medium text-white hover:bg-harbor-blue"
          >
            Download .pptx
          </a>
        )}
      </div>

      {!presentation?.deckPlanJson ? (
        <div className="rounded-lg border border-dashed border-stone bg-white p-10 text-center text-sm text-black/50">
          No presentation has been generated for this comparison yet.
        </div>
      ) : (
        <DeckPreview plan={presentation.deckPlanJson as unknown as ReviewDeckPlan} />
      )}

      {comparison.deckVersions.length > 1 && (
        <div className="mt-6 rounded-lg border border-stone bg-white p-5">
          <p className="mb-3 text-sm font-medium text-black">
            Version history ({comparison.deckVersions.length})
          </p>
          <ul className="space-y-2 text-sm">
            {comparison.deckVersions.map((v) => (
              <li key={v.id} className="flex items-center justify-between">
                <span className="text-black/70">
                  <span className="font-medium text-black">v{v.versionNumber}</span>
                  {v.versionNumber === currentVersionNumber && (
                    <span className="ml-2 rounded-full bg-celadon px-2 py-0.5 text-xs font-medium text-black">
                      Current
                    </span>
                  )}
                  <span className="ml-2 text-black/50">
                    {new Date(v.generatedAt).toLocaleString()} · {v.slideCount} slides
                    {v.generatedBy && ` · ${v.generatedBy.name ?? v.generatedBy.email}`}
                  </span>
                </span>
                <a
                  href={`/api/comparisons/${comparison.id}/deck?version=${v.versionNumber}`}
                  className="font-medium text-samsung-blue hover:underline"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
