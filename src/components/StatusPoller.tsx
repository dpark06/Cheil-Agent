"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const IN_PROGRESS_STATUSES = new Set([
  "UPLOADING",
  "PROCESSING",
  "DIFFED",
  "AI_PROCESSING",
  "GENERATING_DECK",
]);

// A single failed poll is routine (a dev-server restart, a momentary DB
// blip). This many *consecutive* failures — ~20s at the default interval —
// means polling itself is broken, not the job. Surfacing that beats leaving
// the loading UI spinning forever with no explanation, which is exactly the
// failure mode this component exists to prevent.
const CONSECUTIVE_FAILURES_BEFORE_WARNING = 5;

/**
 * Polls comparison status while a background job may still be running and
 * refreshes the (server-rendered) page when it changes. No-ops once the
 * comparison reaches a stable state (READY_FOR_REVIEW, COMPLETE, FAILED, ...).
 */
export function StatusPoller({
  comparisonId,
  currentStatus,
  currentStage = null,
  currentProcessedCount = null,
  intervalMs = 2000,
}: {
  comparisonId: string;
  currentStatus: string;
  /** Comparison.deckGenerationStage — changes within a single GENERATING_DECK
   * status, so it needs its own change-check alongside comparisonStatus. */
  currentStage?: string | null;
  /** Comparison.processedCount — ticks up within a single AI_PROCESSING (or
   * other countable-phase) status, same reasoning as currentStage. */
  currentProcessedCount?: number | null;
  intervalMs?: number;
}) {
  const router = useRouter();
  const lastStatus = useRef(currentStatus);
  const lastStage = useRef(currentStage);
  const lastProcessedCount = useRef(currentProcessedCount);
  const [pollingBroken, setPollingBroken] = useState(false);

  useEffect(() => {
    lastStatus.current = currentStatus;
    lastStage.current = currentStage;
    lastProcessedCount.current = currentProcessedCount;
    setPollingBroken(false);
    if (!IN_PROGRESS_STATUSES.has(currentStatus)) return;

    let consecutiveFailures = 0;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/status?comparisonId=${comparisonId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        consecutiveFailures = 0;
        setPollingBroken(false);
        const statusChanged = data.comparisonStatus && data.comparisonStatus !== lastStatus.current;
        const stageChanged = data.deckGenerationStage !== lastStage.current;
        const countChanged = data.processedCount !== lastProcessedCount.current;
        if (statusChanged || stageChanged || countChanged) {
          lastStatus.current = data.comparisonStatus;
          lastStage.current = data.deckGenerationStage;
          lastProcessedCount.current = data.processedCount;
          router.refresh();
        }
      } catch {
        consecutiveFailures += 1;
        if (consecutiveFailures >= CONSECUTIVE_FAILURES_BEFORE_WARNING) {
          setPollingBroken(true);
        }
        // Otherwise treat as transient — try again on the next tick.
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [comparisonId, currentStatus, currentStage, currentProcessedCount, intervalMs, router]);

  if (!pollingBroken) return null;

  return (
    <p className="mt-2 rounded-md bg-sunlight/40 px-3 py-2 text-xs text-black/70" role="status">
      Having trouble checking progress — this page may be out of date. Try reloading.
    </p>
  );
}
