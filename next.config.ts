import { createMDX } from "fumadocs-mdx/next";
import { execSync } from "node:child_process";
import type { NextConfig } from "next";

const withMDX = createMDX();

/** Names this build, so open tabs can tell when a newer one has been deployed: the commit if there is one, otherwise the build time. */
function buildId(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return `${execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()}-${Date.now()}`;
  } catch {
    return String(Date.now());
  }
}

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: buildId() },
  cacheComponents: true,
  partialPrefetching: true,
  // The price page used to live at /price, and what became Wayback used to be called Hindsight (and before that, the home page); old
  // links and bookmarks keep working. A home-page address that carries a tool's settings (?tab=..., ?s=..., ?amt=...) moves to Wayback.
  async redirects() {
    const toolKeys = ["tab", "s", "coin", "kind", "chain", "a", "amt", "range", "from", "to", "plan", "lev", "run", "basis"];
    return [
      { source: "/price", destination: "/wayback?view=price", permanent: true },
      { source: "/hindsight", destination: "/wayback", permanent: true },
      ...toolKeys.map((key) => ({ source: "/", has: [{ type: "query" as const, key }], destination: "/wayback", permanent: false })),
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/api/version",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withMDX(nextConfig);
