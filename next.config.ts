import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["pdf-parse"],
  outputFileTracingIncludes: {
    "/api/analyze": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
};

export default nextConfig;
