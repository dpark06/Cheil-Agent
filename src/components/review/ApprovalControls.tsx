"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ApprovalControlsProps {
  comparisonId: string;
  changeId: string;
  initialExplanation: string;
}

export function ApprovalControls({
  comparisonId,
  changeId,
  initialExplanation,
}: ApprovalControlsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialExplanation);
  const [submitting, setSubmitting] = useState(false);

  async function updateStatus(
    reviewStatus: "CONFIRMED" | "EDITED" | "REJECTED" | "MINOR",
    extra?: { editedExplanation?: string },
  ) {
    setSubmitting(true);
    await fetch(`/api/comparisons/${comparisonId}/changes/${changeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewStatus, ...extra }),
    });
    setSubmitting(false);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="mt-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-stone px-3 py-2 text-sm focus:border-samsung-blue focus:outline-none"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => updateStatus("EDITED", { editedExplanation: draft })}
            className="rounded-md bg-samsung-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Save edit
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setEditing(false)}
            className="rounded-md border border-stone px-3 py-1.5 text-xs font-medium text-black"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={submitting}
        onClick={() => updateStatus("CONFIRMED")}
        className="rounded-md bg-celadon px-3 py-1.5 text-xs font-medium text-black hover:bg-celadon/70 disabled:opacity-50"
      >
        Confirm
      </button>
      <button
        type="button"
        disabled={submitting}
        onClick={() => setEditing(true)}
        className="rounded-md border border-stone px-3 py-1.5 text-xs font-medium text-black hover:bg-morning-sky disabled:opacity-50"
      >
        Edit explanation
      </button>
      <button
        type="button"
        disabled={submitting}
        onClick={() => updateStatus("MINOR")}
        className="rounded-md border border-stone px-3 py-1.5 text-xs font-medium text-black hover:bg-morning-sky disabled:opacity-50"
      >
        Mark minor
      </button>
      <button
        type="button"
        disabled={submitting}
        onClick={() => updateStatus("REJECTED")}
        className="rounded-md border border-pulse px-3 py-1.5 text-xs font-medium text-pulse hover:bg-pulse/10 disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}
