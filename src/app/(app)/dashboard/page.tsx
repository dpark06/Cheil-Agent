import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { COMPARISON_STATUS_STYLES } from "@/lib/ui/status-colors";

const STATUS_LABEL: Record<string, string> = {
  UPLOADING: "Uploading",
  PROCESSING: "Processing",
  DIFFED: "Diffed",
  AI_PROCESSING: "Analyzing",
  READY_FOR_REVIEW: "Ready for review",
  APPROVED: "Approved",
  GENERATING_DECK: "Generating deck",
  COMPLETE: "Complete",
  FAILED: "Failed",
};

export default async function DashboardPage() {
  const session = await auth();
  const comparisons = await db.comparison.findMany({
    where: { ownerId: session!.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-black">Comparisons</h2>
        <Link
          href="/comparisons/new"
          className="rounded-md bg-samsung-blue px-4 py-2 text-sm font-medium text-white hover:bg-harbor-blue"
        >
          New comparison
        </Link>
      </div>

      {comparisons.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone bg-white p-10 text-center text-sm text-black/60">
          No comparisons yet. Upload a previous and new version of a file to get started.
        </div>
      ) : (
        <ul className="divide-y divide-stone rounded-lg border border-stone bg-white">
          {comparisons.map((c) => (
            <li key={c.id}>
              <Link
                href={`/comparisons/${c.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-morning-sky"
              >
                <div>
                  <p className="text-sm font-medium text-black">{c.title}</p>
                  <p className="text-xs text-black/50">
                    {new Date(c.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${COMPARISON_STATUS_STYLES[c.status] ?? "bg-stone text-black"}`}
                >
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
