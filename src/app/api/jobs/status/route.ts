import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const comparisonId = new URL(request.url).searchParams.get("comparisonId");
  if (!comparisonId) {
    return NextResponse.json({ error: "comparisonId is required." }, { status: 400 });
  }

  const comparison = await db.comparison.findUnique({
    where: { id: comparisonId },
    select: {
      ownerId: true,
      status: true,
      errorMessage: true,
      deckGenerationStage: true,
      processedCount: true,
      totalCount: true,
    },
  });
  if (!comparison || (comparison.ownerId !== session.user.id && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const latestJob = await db.jobRun.findFirst({
    where: { comparisonId },
    orderBy: { createdAt: "desc" },
    select: { taskIdentifier: true, status: true, lastError: true, attempts: true },
  });

  return NextResponse.json({
    comparisonStatus: comparison.status,
    errorMessage: comparison.errorMessage,
    deckGenerationStage: comparison.deckGenerationStage,
    processedCount: comparison.processedCount,
    totalCount: comparison.totalCount,
    latestJob,
  });
}
