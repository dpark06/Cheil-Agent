/**
 * The primary visual indicator for any long-running comparison phase
 * (upload processing, AI analysis, deck generation) — a bar, not just a
 * status word. `percent` renders an actual fill (real progress, when the
 * underlying phase is countable); omitting it renders an indeterminate
 * sliding animation for phases too fast/uncountable to size accurately
 * (see comparisons/[id]/page.tsx for which is which and why).
 */
export function ProgressBar({ label, percent }: { label: string; percent?: number }) {
  const clamped = percent === undefined ? undefined : Math.max(0, Math.min(100, percent));

  return (
    <div className="mt-2" role="status" aria-live="polite">
      <p className="text-sm text-harbor-blue">{label}…</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-morning-sky">
        {clamped === undefined ? (
          <div className="h-full w-1/3 animate-deck-progress rounded-full bg-samsung-blue" />
        ) : (
          <div
            className="h-full rounded-full bg-samsung-blue transition-[width] duration-500 ease-out"
            style={{ width: `${clamped}%` }}
          />
        )}
      </div>
    </div>
  );
}
