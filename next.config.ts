import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack infers the workspace root from the nearest lockfile, which on a
  // machine with a stray package-lock.json in the home directory resolves
  // above the repo and ignores ours.
  turbopack: { root: __dirname },
  serverExternalPackages: ["pg"],
  experimental: {
    // Connectivity detection plus automatic retry of blocked navigations and
    // Server Actions. Also what makes `useOffline` return anything but false.
    useOffline: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // A cached service worker is a service worker you cannot replace.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
