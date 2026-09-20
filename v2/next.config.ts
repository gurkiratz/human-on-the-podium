import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the tracing root to this project (a parent lockfile otherwise makes Next guess).
  outputFileTracingRoot: process.cwd(),
  devIndicators: false,
  // Stagehand loads its browser extension from disk and uses dynamic requires, so keep it
  // out of the bundler and require it at runtime from node_modules instead.
  serverExternalPackages: ["@browserbasehq/stagehand"],
};

export default nextConfig;
