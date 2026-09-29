import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit/audit-log";

const patchSchema = z.object({
  reviewStatus: z.enum(["CONFIRMED", "EDITED", "REJECTED", "MINOR"]),
  editedExplanation: z.string().trim().max(3000).optional(),
  humanNote: z.string().trim().max(1000).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; changeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: comparisonId, changeId } = await params;

  const comparison = await db.comparison.findUnique({
    where: { id: comparisonId },
    select: { id: true, ownerId: true },
  });
  if (!comparison) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (comparison.ownerId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const change = await db.detectedChange.findFirst({
    where: { id: changeId, comparisonId },
  });
  if (!change) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await db.detectedChange.update({
    where: { id: changeId },
    data: {
      reviewStatus: parsed.data.reviewStatus,
      editedExplanation: parsed.data.editedExplanation ?? change.editedExplanation,
      humanNote: parsed.data.humanNote ?? change.humanNote,
    },
  });

  await logAuditEvent({
    userId: session.user.id,
    comparisonId,
    eventType: "change_review_updated",
    payload: {
      changeId,
      reviewStatus: parsed.data.reviewStatus,
      edited: Boolean(parsed.data.editedExplanation),
    },
  });

  return NextResponse.json({ change: updated });
}
