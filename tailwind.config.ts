import type { Config } from "tailwindcss";
import { BRAND_HEX } from "./src/lib/brand-colors";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "samsung-blue": BRAND_HEX.samsungBlue,
        "confident-blue": BRAND_HEX.confidentBlue,
        "harbor-blue": BRAND_HEX.harborBlue,
        "morning-sky": BRAND_HEX.morningSky,
        clay: BRAND_HEX.clay,
        stone: BRAND_HEX.stone,
        porcelain: BRAND_HEX.porcelain,
        celadon: BRAND_HEX.celadon,
        persimmon: BRAND_HEX.persimmon,
        bloom: BRAND_HEX.bloom,
        rosey: BRAND_HEX.rosey,
        pulse: BRAND_HEX.pulse,
        sunlight: BRAND_HEX.sunlight,
      },
    },
  },
  plugins: [],
};

export default config;
