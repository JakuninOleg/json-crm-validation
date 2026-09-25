import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  outputFileTracingIncludes: {
    "/api/analyze": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
