import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStorageAdapter } from "@/lib/storage/local-storage-adapter";
import { enqueueJob } from "@/lib/jobs/queue";
import { logAuditEvent } from "@/lib/audit/audit-log";

async function loadOwnedComparison(comparisonId: string, userId: string, role: string) {
  const comparison = await db.comparison.findUnique({
    where: { id: comparisonId },
    include: { detectedChanges: true },
  });
  if (!comparison) return null;
  if (comparison.ownerId !== userId && role !== "ADMIN") return null;
  return comparison;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: comparisonId } = await params;
  const comparison = await loadOwnedComparison(comparisonId, session.user.id, session.user.role);
  if (!comparison) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pendingCount = comparison.detectedChanges.filter((c) => c.reviewStatus === "PENDING").length;
  if (comparison.detectedChanges.length === 0 || pendingCount > 0) {
    return NextResponse.json(
      { error: "All detected changes must be reviewed before generating a deck." },
      { status: 400 },
    );
  }

  await db.comparison.update({ where: { id: comparisonId }, data: { status: "GENERATING_DECK" } });

  try {
    await enqueueJob("generate-deck", comparisonId, { userId: session.user.id });
  } catch (error) {
    await db.comparison.update({
      where: { id: comparisonId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Failed to queue deck generation.",
      },
    });
    return NextResponse.json({ error: "Failed to queue deck generation." }, { status: 500 });
  }

  return NextResponse.json({ queued: true });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: comparisonId } = await params;
  const comparison = await db.comparison.findUnique({
    where: { id: comparisonId },
    select: { ownerId: true, title: true },
  });
  if (!comparison || (comparison.ownerId !== session.user.id && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ?version=<versionNumber> downloads a specific past DeckVersion; omitted
  // falls back to the current deck (PresentationSession), same as before
  // deck versioning existed.
  const versionParam = new URL(request.url).searchParams.get("version");
  let pptxStoragePath: string | null;

  if (versionParam) {
    const versionNumber = Number(versionParam);
    if (!Number.isInteger(versionNumber)) {
      return NextResponse.json({ error: "Invalid version." }, { status: 400 });
    }
    const version = await db.deckVersion.findUnique({
      where: { comparisonId_versionNumber: { comparisonId, versionNumber } },
    });
    pptxStoragePath = version?.pptxStoragePath ?? null;
  } else {
    const presentation = await db.presentationSession.findUnique({ where: { comparisonId } });
    pptxStoragePath = presentation?.pptxStoragePath ?? null;
  }

  if (!pptxStoragePath) {
    return NextResponse.json({ error: "Deck has not been generated yet." }, { status: 404 });
  }

  const storage = getStorageAdapter();
  const buffer = await storage.get(pptxStoragePath);

  await db.presentationSession.update({
    where: { comparisonId },
    data: { downloadCount: { increment: 1 } },
  });
  await logAuditEvent({
    userId: session.user.id,
    comparisonId,
    eventType: "deck_downloaded",
    payload: versionParam ? { versionNumber: Number(versionParam) } : undefined,
  });

  const safeTitle = comparison.title.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${safeTitle || "cheil-delta-deck"}.pptx"`,
    },
  });
}
