/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "sharp",
    "pdfjs-dist",
    "tesseract.js",
    "pptxgenjs",
    "@napi-rs/canvas",
    "graphile-worker",
  ],
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
