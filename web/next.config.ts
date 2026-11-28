import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The release gate builds a staged snapshot before changing the active pointer.
const releaseId = process.env.WIKI_BUILD_RELEASE_ID || JSON.parse(readFileSync(
  resolve(process.cwd(), "public/data/release-current.json"), "utf8")).releaseId;
if (typeof releaseId !== "string" || !/^[0-9a-f]{64}$/.test(releaseId)) {
  throw new Error("Invalid catalog release pointer");
}

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_CATALOG_BUILD_RELEASE_ID: releaseId },
  outputFileTracingIncludes: {
    '/api/interpret': ['./runtime-releases/**/*'],
    '/api/wiki-search': ['./runtime-releases/**/*'],
    '/api/wiki-page': ['./runtime-releases/**/*'],
    '/api/knowledge': ['./runtime-releases/**/*'],
    '/api/knowledge-answer': ['./runtime-releases/**/*'],
    '/api/online-evidence': ['./runtime-releases/**/*'],
  },
};

export default nextConfig;
