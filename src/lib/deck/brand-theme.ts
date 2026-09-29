import { BRAND_HEX } from "@/lib/brand-colors";

/**
 * Colors and typography extracted from the internal "Samsung Brand Creative
 * Playbook" excerpt (Color + Typography sections) provided for this project.
 * That excerpt did not include logo or spacing/grid pages, so this theme
 * covers color and type only — no logo is placed in generated decks.
 *
 * Colors are hex without "#" (pptxgenjs's convention) — derived from the
 * shared BRAND_HEX palette in src/lib/brand-colors.ts, which the app's
 * Tailwind theme also uses, so deck and interface colors never drift apart.
 * Text/background pairs below are chosen from the guideline's own ADA
 * contrast matrix (AA18/AA/AAA combinations only) — see the matrix on the
 * Color page of the source deck.
 */
export const BRAND_COLORS = Object.fromEntries(
  Object.entries(BRAND_HEX).map(([name, hex]) => [name, hex.replace("#", "")]),
) as { [K in keyof typeof BRAND_HEX]: string };

/**
 * The guideline's custom "SamsungSS Head" / "SamsungSS Body" typefaces are
 * referenced by name only — the actual font files aren't available in this
 * environment, so these are set as PowerPoint fontFace values. PowerPoint
 * falls back to a default font silently if a viewer's machine doesn't have
 * them installed; nothing breaks either way. pptxgenjs only exposes a
 * bold on/off flag, not the full Bold/Medium/Regular/Light weight range the
 * guideline defines, so Medium and Regular both map to bold:false here.
 */
export const BRAND_FONTS = {
  head: "SamsungSS Head",
  body: "SamsungSS Body",
} as const;

export const BRAND_THEME = {
  colors: BRAND_COLORS,
  fonts: BRAND_FONTS,
  /** Title slide: Samsung Blue background, white text — AAA contrast per the guideline's own matrix. */
  titleSlide: {
    background: BRAND_COLORS.samsungBlue,
    headline: BRAND_COLORS.white,
    subtext: BRAND_COLORS.white,
  },
  /** Content slides: white background (per "white and black used most dominantly"), Samsung Blue as the brand throughline on titles/labels. */
  contentSlide: {
    background: BRAND_COLORS.white,
    title: BRAND_COLORS.samsungBlue,
    body: BRAND_COLORS.black,
    caption: BRAND_COLORS.samsungBlue,
  },
} as const;
