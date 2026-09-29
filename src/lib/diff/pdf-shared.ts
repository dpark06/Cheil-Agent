import path from "path";

// pdfjs-dist's Node font fetcher passes this straight to fs.readFile(), so it
// must be a plain filesystem path (not a file:// URL). Built from
// process.cwd() rather than require.resolve() because require.resolve()
// gets rewritten by webpack's module bundling even for otherwise-external
// packages, producing a bogus (numeric) path at runtime.
export const STANDARD_FONT_DATA_URL =
  path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts") + path.sep;
