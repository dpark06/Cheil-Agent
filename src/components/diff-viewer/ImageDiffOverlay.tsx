"use client";

import { useState } from "react";

const VARIANTS = ["previous", "new", "overlay"] as const;
type Variant = (typeof VARIANTS)[number];

export function ImageDiffOverlay({
  comparisonId,
  changeId,
}: {
  comparisonId: string;
  changeId: string;
}) {
  const [variant, setVariant] = useState<Variant>("overlay");
  const src = `/api/comparisons/${comparisonId}/changes/${changeId}/image?variant=${variant}`;

  return (
    <div>
      <div className="mb-2 flex gap-2 text-xs">
        {VARIANTS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVariant(v)}
            className={`rounded px-2 py-1 capitalize ${
              variant === v ? "bg-samsung-blue text-white" : "bg-morning-sky text-harbor-blue"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic authenticated image, not a static asset */}
      <img
        src={src}
        alt={`${variant} version of the changed region`}
        className="max-h-80 rounded border border-stone object-contain"
      />
    </div>
  );
}
