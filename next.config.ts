import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone", // the release folder runs .next/standalone/server.js
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: { "*": ["data/**", "release/**", "scripts/**", "tests/**"] }, // never ship local data into a release
  poweredByHeader: false,
  async headers() {
    // The app is never meant to sit inside another page.
    return [{ source: "/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] }];
  },
  experimental: { serverActions: { bodySizeLimit: "3mb" } }, // logo upload
};

export default config;
