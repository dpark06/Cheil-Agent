/**
 * Single source of truth for the Samsung brand palette, extracted from the
 * internal "Samsung Brand Creative Playbook" excerpt (Color section) in
 * /Brand Guideline/Brand Guideline.pdf. Used by both the app's Tailwind
 * theme (tailwind.config.ts) and the generated-deck theme
 * (src/lib/deck/brand-theme.ts) so the two never drift apart.
 */
export const BRAND_HEX = {
  samsungBlue: "#1428A0",
  confidentBlue: "#020DCB", // digital-only per the guideline
  harborBlue: "#3C90EF",
  morningSky: "#EAF8FC",
  clay: "#A9989E",
  stone: "#DADADA",
  porcelain: "#FCF8E6",
  celadon: "#8AE1B8",
  persimmon: "#FFC861",
  bloom: "#F5BAEF",
  rosey: "#FB44A0",
  pulse: "#E91C2F",
  sunlight: "#FCFC63",
  black: "#000000",
  white: "#FFFFFF",
} as const;

export type BrandColorName = keyof typeof BRAND_HEX;
