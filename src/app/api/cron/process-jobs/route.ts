import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { processPendingJobsOnce } from "@/lib/jobs/run-once";

// 60s is Vercel's actual ceiling on the free Hobby plan regardless of what's
// declared here (a higher number silently gets capped back down) — Pro
// plans can go to 300s. A comparison with several changes run through a
// real (non-mock) AI provider can still exceed 60s; if the function is
// killed mid-run, graphile-worker's row lock on that job eventually expires
// and it becomes eligible for retry (see JOB_LIMITS' maxAttempts), but that
// can take a while — mock mode's near-instant calls avoid this risk
// entirely, which is the main practical reason to default to it here.
export const maxDuration = 60;

/**
 * Catch-up safety net for a serverless deploy with no long-running worker
 * process — see run-once.ts and queue.ts for why this exists alongside the
 * immediate after()-triggered sweep. Meant to be hit on a schedule by an
 * external trigger (this repo's own GitHub Actions cron workflow), not by
 * anything in the app's own UI.
 *
 * Auth is a single shared secret compared in constant time, not full user
 * auth — this endpoint does nothing an authenticated user's own actions
 * couldn't already trigger (it only processes jobs that already exist in
 * the queue), so the bar here is "not a public trigger for arbitrary
 * strangers to hammer," not "protect sensitive data."
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on this deployment." },
      { status: 500 },
    );
  }

  const provided = new URL(request.url).searchParams.get("secret") ?? "";
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  const isValid =
    expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await processPendingJobsOnce();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[/api/cron/process-jobs] processPendingJobsOnce() failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job processing failed." },
      { status: 500 },
    );
  }
}
