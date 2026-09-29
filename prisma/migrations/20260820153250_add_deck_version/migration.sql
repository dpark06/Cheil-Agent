-- CreateTable
CREATE TABLE "DeckVersion" (
    "id" TEXT NOT NULL,
    "comparisonId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "deckPlanJson" JSONB NOT NULL,
    "pptxStoragePath" TEXT NOT NULL,
    "slideCount" INTEGER NOT NULL,
    "generatedByUserId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeckVersion_comparisonId_idx" ON "DeckVersion"("comparisonId");

-- CreateIndex
CREATE UNIQUE INDEX "DeckVersion_comparisonId_versionNumber_key" ON "DeckVersion"("comparisonId", "versionNumber");

-- AddForeignKey
ALTER TABLE "DeckVersion" ADD CONSTRAINT "DeckVersion_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "Comparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckVersion" ADD CONSTRAINT "DeckVersion_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

