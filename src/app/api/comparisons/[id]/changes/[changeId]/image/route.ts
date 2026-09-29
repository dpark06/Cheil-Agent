import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStorageAdapter } from "@/lib/storage/local-storage-adapter";

interface ImageRawDiff {
  overlayStoragePath: string;
  previousImagePath: string;
  newImagePath: string;
}

const VARIANT_KEYS = {
  overlay: "overlayStoragePath",
  previous: "previousImagePath",
  new: "newImagePath",
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; changeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: comparisonId, changeId } = await params;
  const variantParam = new URL(request.url).searchParams.get("variant") ?? "overlay";
  if (!(variantParam in VARIANT_KEYS)) {
    return NextResponse.json({ error: "Invalid variant." }, { status: 400 });
  }
  const variant = variantParam as keyof typeof VARIANT_KEYS;

  const comparison = await db.comparison.findUnique({
    where: { id: comparisonId },
    select: { ownerId: true },
  });
  if (!comparison || (comparison.ownerId !== session.user.id && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const change = await db.detectedChange.findFirst({
    where: { id: changeId, comparisonId, changeType: "IMAGE" },
    select: { rawDiffData: true },
  });
  if (!change) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const raw = change.rawDiffData as unknown as ImageRawDiff;
  const storageKey = raw[VARIANT_KEYS[variant]];
  if (!storageKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storage = getStorageAdapter();
  const buffer = await storage.get(storageKey);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
