import { createWorker, type Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }
  return workerPromise;
}

export interface OcrResult {
  text: string;
  confidence: number;
}

/**
 * Runs OCR on a page image. Only called for pages whose extractable PDF text
 * layer is too short (see diff-orchestrator.ts) — most pages skip OCR
 * entirely to save time and cost.
 */
export async function ocrImage(pngBuffer: Buffer): Promise<OcrResult> {
  const worker = await getWorker();
  const { data } = await worker.recognize(pngBuffer);
  return { text: data.text.trim(), confidence: data.confidence };
}

export async function shutdownOcr(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
