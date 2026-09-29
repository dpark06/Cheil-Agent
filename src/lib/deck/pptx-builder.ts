import PptxGenJS from "pptxgenjs";
import type { DetectedChange } from "@prisma/client";
import type { ReviewDeckPlan } from "@/lib/ai/schemas/review-deck-planner.schema";
import { getStorageAdapter } from "@/lib/storage/local-storage-adapter";
import { computeContainRect, getImageNaturalSize, type Rect } from "./image-fit";
import { fitText, fitBulletList } from "./text-fit";
import { BRAND_THEME } from "./brand-theme";

interface ImageRawDiff {
  previousImagePath: string;
  newImagePath: string;
}

type PptxSlide = ReturnType<PptxGenJS["addSlide"]>;

// LAYOUT_16x9 is 10in x 5.625in — every content slide's boxes must sum to
// no more than this, or content runs off the bottom of the rendered slide
// regardless of what font size is used inside any single box.
const SLIDE_WIDTH = 10;
const SLIDE_HEIGHT = 5.625;
const BOTTOM_MARGIN = 0.3;

/**
 * Places an image scaled to fit entirely within `box` (never stretched,
 * never cropped), centered, with whitespace on whichever axis is shorter.
 * The single place all asset placement should go through — see
 * src/lib/deck/image-fit.ts for why pptxgenjs's own `sizing: "contain"`
 * can't be used directly.
 */
async function addContainedImage(slide: PptxSlide, buffer: Buffer, box: Rect): Promise<void> {
  const { width, height } = await getImageNaturalSize(buffer);
  const fitted = computeContainRect(width, height, box);
  slide.addImage({
    data: `data:image/png;base64,${buffer.toString("base64")}`,
    x: fitted.x,
    y: fitted.y,
    w: fitted.w,
    h: fitted.h,
  });
}

/**
 * Deterministic app code — consumes the AI's schema-validated slide plan and
 * builds a real .pptx. The AI never touches file generation directly.
 * Styling follows BRAND_THEME (src/lib/deck/brand-theme.ts) by default.
 */
export async function buildPptx(plan: ReviewDeckPlan, changes: DetectedChange[]): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  const storage = getStorageAdapter();
  const changeById = new Map(changes.map((c) => [c.id, c]));
  const { colors, fonts, titleSlide: titleTheme, contentSlide: contentTheme } = BRAND_THEME;

  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: titleTheme.background };
  const deckTitleFit = fitText({
    text: plan.deckTitle,
    boxWidthIn: 9,
    boxHeightIn: 1.2,
    maxFontSize: 32,
    minFontSize: 18,
  });
  titleSlide.addText(deckTitleFit.text, {
    x: 0.5,
    y: 2.2,
    w: 9,
    h: 1.2,
    fontSize: deckTitleFit.fontSize,
    bold: true,
    fontFace: fonts.head,
    color: titleTheme.headline,
    align: "center",
  });
  titleSlide.addText(`${plan.slides.length} change(s) reviewed`, {
    x: 0.5,
    y: 3.2,
    w: 9,
    h: 0.5,
    fontSize: 14,
    fontFace: fonts.body,
    color: titleTheme.subtext,
    align: "center",
  });

  for (const slideDef of plan.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: contentTheme.background };

    const titleFit = fitText({
      text: slideDef.title,
      boxWidthIn: 9.2,
      boxHeightIn: 0.6,
      maxFontSize: 22,
      minFontSize: 14,
    });
    slide.addText(titleFit.text, {
      x: 0.4,
      y: 0.3,
      w: 9.2,
      h: 0.6,
      fontSize: titleFit.fontSize,
      bold: true,
      fontFace: fonts.head,
      color: contentTheme.title,
    });

    const primaryChange = slideDef.changeIds.map((id) => changeById.get(id)).find(Boolean);
    let contentTop = 1.05;

    if (primaryChange?.changeType === "IMAGE") {
      const raw = primaryChange.rawDiffData as unknown as ImageRawDiff;
      try {
        const [prevBuf, newBuf] = await Promise.all([
          storage.get(raw.previousImagePath),
          storage.get(raw.newImagePath),
        ]);
        // Sized (2.0in, not the full remaining space) so there's always
        // room left below for explanation + discussion questions without
        // the slide's total content height exceeding SLIDE_HEIGHT.
        const imageBoxHeight = 2.0;
        await addContainedImage(slide, prevBuf, { x: 0.4, y: contentTop, w: 4.3, h: imageBoxHeight });
        await addContainedImage(slide, newBuf, { x: 5.0, y: contentTop, w: 4.3, h: imageBoxHeight });
        slide.addText("Before", {
          x: 0.4,
          y: contentTop + imageBoxHeight,
          w: 4.3,
          h: 0.25,
          fontSize: 10,
          fontFace: fonts.body,
          color: contentTheme.caption,
          align: "center",
        });
        slide.addText("After", {
          x: 5.0,
          y: contentTop + imageBoxHeight,
          w: 4.3,
          h: 0.25,
          fontSize: 10,
          fontFace: fonts.body,
          color: contentTheme.caption,
          align: "center",
        });
        contentTop += imageBoxHeight + 0.25 + 0.15;
      } catch {
        // Missing/expired image on disk — fall through to text-only slide.
      }
    }

    // Whatever vertical space is left after the title (and images, if any)
    // gets split between the explanation and discussion questions — never
    // fixed heights that could add up to more than the slide actually has.
    const remaining = SLIDE_HEIGHT - BOTTOM_MARGIN - contentTop;
    const hasDiscussion = slideDef.discussionQuestions.length > 0;
    const discussionLabelHeight = hasDiscussion ? 0.3 : 0;
    const availableForText = Math.max(0.4, remaining - discussionLabelHeight);
    const explanationHeight = hasDiscussion ? Math.max(0.5, availableForText * 0.55) : availableForText;
    const discussionListHeight = hasDiscussion ? Math.max(0.4, availableForText - explanationHeight) : 0;

    const explanationFit = fitText({
      text: slideDef.explanationSummary,
      boxWidthIn: 9.2,
      boxHeightIn: explanationHeight,
      maxFontSize: 13,
      minFontSize: 9,
    });
    slide.addText(explanationFit.text, {
      x: 0.4,
      y: contentTop,
      w: 9.2,
      h: explanationHeight,
      fontSize: explanationFit.fontSize,
      fontFace: fonts.body,
      color: contentTheme.body,
      valign: "top",
    });
    contentTop += explanationHeight;

    if (hasDiscussion) {
      slide.addText("Discussion questions", {
        x: 0.4,
        y: contentTop,
        w: 9.2,
        h: discussionLabelHeight,
        fontSize: 12,
        bold: true,
        fontFace: fonts.body,
        color: contentTheme.body,
      });
      const discussionFit = fitBulletList({
        items: slideDef.discussionQuestions,
        boxWidthIn: 9.0, // slightly narrower than the label — leaves room for the bullet glyph
        boxHeightIn: discussionListHeight,
        maxFontSize: 11,
        minFontSize: 8,
      });
      slide.addText(
        discussionFit.items.map((q) => ({ text: q, options: { bullet: true, breakLine: true } })),
        {
          x: 0.4,
          y: contentTop + discussionLabelHeight,
          w: 9.2,
          h: discussionListHeight,
          fontSize: discussionFit.fontSize,
          fontFace: fonts.body,
          color: contentTheme.body,
        },
      );
    }
  }

  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(output as Uint8Array);
}
