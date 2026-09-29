/**
 * CI smoke test: runs the full pipeline (diff -> AI -> approve -> deck) end
 * to end against the fixture PDFs and asserts a valid, non-trivial .pptx
 * comes out the other end. Uses AI_PROVIDER=mock so it needs no API key.
 */
import { readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { getStorageAdapter } from "../src/lib/storage/local-storage-adapter";
import { processComparisonDiff } from "../src/lib/diff/diff-orchestrator";
import { runAiPipeline } from "../src/lib/ai/pipeline-orchestrator";
import { generateDeckForComparison } from "../src/lib/deck/generate-deck";

async function main() {
  console.log("CI smoke test: creating throwaway user + comparison...");

  const user = await db.user.create({
    data: {
      email: `ci-smoke-${Date.now()}@example.com`,
      passwordHash: await bcrypt.hash("throwaway-password", 4),
      role: "REVIEWER",
    },
  });

  const comparison = await db.comparison.create({
    data: { ownerId: user.id, title: "CI smoke test", status: "UPLOADING" },
  });

  const storage = getStorageAdapter();
  const previousBuf = await readFile(path.join(process.cwd(), "fixtures/previous.pdf"));
  const newBuf = await readFile(path.join(process.cwd(), "fixtures/next.pdf"));

  for (const [role, buf] of [
    ["PREVIOUS", previousBuf],
    ["NEW", newBuf],
  ] as const) {
    const storageKey = `${comparison.id}/${role.toLowerCase()}.pdf`;
    await storage.put(storageKey, buf);
    await db.fileAsset.create({
      data: {
        comparisonId: comparison.id,
        role,
        originalName: `${role.toLowerCase()}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: buf.length,
        storagePath: storageKey,
        checksumSha256: crypto.createHash("sha256").update(buf).digest("hex"),
        scanStatus: "CLEAN",
      },
    });
  }
  await db.comparison.update({ where: { id: comparison.id }, data: { status: "PROCESSING" } });

  console.log("Running diff pipeline...");
  await processComparisonDiff(comparison.id);

  console.log("Running AI pipeline (mock)...");
  await runAiPipeline(comparison.id);

  const changes = await db.detectedChange.findMany({ where: { comparisonId: comparison.id } });
  if (changes.length === 0) {
    throw new Error("Smoke test failed: no changes detected from fixture PDFs.");
  }

  console.log(`Confirming ${changes.length} change(s)...`);
  await db.detectedChange.updateMany({
    where: { comparisonId: comparison.id },
    data: { reviewStatus: "CONFIRMED" },
  });

  console.log("Generating deck...");
  const { slideCount } = await generateDeckForComparison(comparison.id, user.id);
  if (slideCount < 2) {
    throw new Error(`Smoke test failed: expected at least 2 slides, got ${slideCount}`);
  }

  const presentation = await db.presentationSession.findUniqueOrThrow({
    where: { comparisonId: comparison.id },
  });
  if (!presentation.pptxStoragePath) {
    throw new Error("Smoke test failed: no pptxStoragePath recorded.");
  }
  const pptxBuffer = await storage.get(presentation.pptxStoragePath);
  const isValidZip = pptxBuffer.length > 1000 && pptxBuffer.subarray(0, 2).toString("ascii") === "PK";
  if (!isValidZip) {
    throw new Error("Smoke test failed: generated .pptx failed integrity check.");
  }

  console.log(`OK: generated a valid ${slideCount}-slide .pptx (${pptxBuffer.length} bytes).`);

  console.log("Cleaning up...");
  await storage.deletePrefix(comparison.id).catch(() => {});
  await db.auditEvent.deleteMany({ where: { comparisonId: comparison.id } });
  await db.jobRun.deleteMany({ where: { comparisonId: comparison.id } });
  await db.comparison.delete({ where: { id: comparison.id } });
  await db.user.delete({ where: { id: user.id } });

  await db.$disconnect();
  console.log("Smoke test passed.");
}

main().catch(async (error) => {
  console.error("CI smoke test FAILED:", error);
  await db.$disconnect();
  process.exit(1);
});
