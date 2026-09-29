"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateDeckButton({
  comparisonId,
  ready,
  hasExistingDeck = false,
}: {
  comparisonId: string;
  ready: boolean;
  /** A deck already exists (PresentationSession) — clicking creates a new
   * version alongside it rather than a first-ever deck. */
  hasExistingDeck?: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/comparisons/${comparisonId}/deck`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Deck generation failed.");
        setSubmitting(false);
        return;
      }
      router.push(`/comparisons/${comparisonId}`);
    } catch {
      setError("Deck generation failed. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={!ready || submitting}
        onClick={handleClick}
        className="rounded-md bg-samsung-blue px-4 py-2 text-sm font-medium text-white hover:bg-harbor-blue disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Generating…" : hasExistingDeck ? "Regenerate deck" : "Generate deck"}
      </button>
      {!ready && (
        <p className="mt-2 text-xs text-black/50">
          Every change must be confirmed, edited, marked minor, or rejected before you can generate
          the deck.
        </p>
      )}
      {ready && hasExistingDeck && !error && (
        <p className="mt-2 text-xs text-black/50">
          Creates a new version — the current deck stays available below.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-pulse">{error}</p>}
    </div>
  );
}
