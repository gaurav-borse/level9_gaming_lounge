import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone", // the release folder runs .next/standalone/server.js
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: { "*": ["data/**", "release/**", "scripts/**", "tests/**"] }, // never ship local data into a release
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "3mb" } }, // logo upload
};

export default config;
