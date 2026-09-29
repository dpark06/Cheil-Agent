import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const OUT_DIR = path.resolve(process.cwd(), "fixtures");

async function buildPdf(opts: {
  headline: string;
  body: string;
  boxColor: [number, number, number];
  boxX: number;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const page1 = doc.addPage([612, 792]);
  page1.setFont(boldFont);
  page1.drawText(opts.headline, { x: 50, y: 720, size: 28, font: boldFont });
  page1.setFont(font);
  page1.drawText(opts.body, { x: 50, y: 680, size: 14, font });
  page1.drawText("Cheil Delta fixture — page 1", { x: 50, y: 40, size: 9, font, color: rgb(0.5, 0.5, 0.5) });

  const page2 = doc.addPage([612, 792]);
  page2.drawRectangle({
    x: opts.boxX,
    y: 400,
    width: 180,
    height: 120,
    color: rgb(...opts.boxColor),
  });
  page2.setFont(font);
  page2.drawText("Cheil Delta fixture — page 2 (visual)", { x: 50, y: 40, size: 9, font, color: rgb(0.5, 0.5, 0.5) });

  return doc.save();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const previous = await buildPdf({
    headline: "Q3 Campaign Strategy",
    body: "Target audience: adults 25-34, urban markets.",
    boxColor: [0.2, 0.4, 0.9],
    boxX: 60,
  });

  const next = await buildPdf({
    headline: "Q3 Campaign Strategy v2",
    body: "Target audience: adults 25-44, urban and suburban markets.",
    boxColor: [0.9, 0.3, 0.2],
    boxX: 220,
  });

  await writeFile(path.join(OUT_DIR, "previous.pdf"), previous);
  await writeFile(path.join(OUT_DIR, "next.pdf"), next);

  console.log(`Wrote fixtures to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
