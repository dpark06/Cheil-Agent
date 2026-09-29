import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStorageAdapter } from "@/lib/storage/local-storage-adapter";
import { validateFileUploadMeta } from "@/lib/security/file-validation";
import { heuristicScan } from "@/lib/security/malware-heuristic";
import { enqueueJob } from "@/lib/jobs/queue";
import { logAuditEvent } from "@/lib/audit/audit-log";
import { assertUnderRateLimit, RateLimitExceededError } from "@/lib/security/rate-limit";
import { LIMITS } from "@/lib/config/limits";

// Bounds how long the after()-triggered immediate job sweep (see
// queue.ts/run-once.ts) gets to run on a serverless deploy before this
// function is torn down — see the cron route for the fuller explanation.
export const maxDuration = 60;

const titleSchema = z.string().trim().min(1).max(200);
const contextSchema = z.string().trim().max(2000).optional();

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await assertUnderRateLimit(session.user.id, "comparison_created", LIMITS.maxUploadsPerHour);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }

  const formData = await request.formData();
  const titleRaw = formData.get("title");
  const previousFile = formData.get("previous");
  const newFile = formData.get("new");

  const titleParsed = titleSchema.safeParse(titleRaw);
  if (!titleParsed.success) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  const contextParsed = contextSchema.safeParse(formData.get("context") || undefined);
  if (!contextParsed.success) {
    return NextResponse.json({ error: "Context is too long (max 2000 characters)." }, { status: 400 });
  }
  if (!(previousFile instanceof File) || !(newFile instanceof File)) {
    return NextResponse.json(
      { error: "Both a previous and new version file are required." },
      { status: 400 },
    );
  }

  const entries: Array<{ role: "PREVIOUS" | "NEW"; file: File }> = [
    { role: "PREVIOUS", file: previousFile },
    { role: "NEW", file: newFile },
  ];

  for (const { file } of entries) {
    const metaResult = validateFileUploadMeta({ name: file.name, type: file.type, size: file.size });
    if (!metaResult.success) {
      return NextResponse.json(
        { error: metaResult.error.issues[0]?.message ?? "Invalid file." },
        { status: 400 },
      );
    }
  }

  const buffers = await Promise.all(entries.map(({ file }) => file.arrayBuffer().then(Buffer.from)));

  for (let i = 0; i < entries.length; i++) {
    const scan = heuristicScan(entries[i].file.name, entries[i].file.type, buffers[i]);
    if (!scan.clean) {
      return NextResponse.json(
        { error: `Rejected "${entries[i].file.name}": ${scan.reason}` },
        { status: 400 },
      );
    }
  }

  const comparison = await db.comparison.create({
    data: {
      ownerId: session.user.id,
      title: titleParsed.data,
      context: contextParsed.data ?? null,
      status: "UPLOADING",
    },
  });

  await logAuditEvent({
    userId: session.user.id,
    comparisonId: comparison.id,
    eventType: "comparison_created",
    payload: { title: titleParsed.data },
  });

  const storage = getStorageAdapter();

  try {
    for (let i = 0; i < entries.length; i++) {
      const { role, file } = entries[i];
      const buffer = buffers[i];
      const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
      const storageKey = `${comparison.id}/${role.toLowerCase()}-${sanitizeFileName(file.name)}`;

      await storage.put(storageKey, buffer);

      await db.fileAsset.create({
        data: {
          comparisonId: comparison.id,
          role,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          storagePath: storageKey,
          checksumSha256: checksum,
          scanStatus: "CLEAN",
        },
      });
    }

    await db.comparison.update({
      where: { id: comparison.id },
      data: { status: "PROCESSING" },
    });
  } catch (error) {
    await db.comparison.update({
      where: { id: comparison.id },
      data: { status: "FAILED", errorMessage: "Upload failed while storing files." },
    });
    throw error;
  }

  try {
    await enqueueJob("process-comparison", comparison.id);
  } catch (error) {
    await db.comparison.update({
      where: { id: comparison.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Failed to queue processing.",
      },
    });
  }

  return NextResponse.json({ id: comparison.id }, { status: 201 });
}
