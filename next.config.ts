import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const isProduction = process.env.NODE_ENV === "production";

// Content-Security-Policy is set per-request in src/proxy.ts so the
// script-src can carry a nonce instead of 'unsafe-inline'.

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg"],
  experimental: {
    optimizePackageImports: ["lucide-react", "chart.js", "@tanstack/react-query"],
  },
  // The three analytics screens used to answer on six URLs, via re-export
  // files. One canonical path each now, with the old bookmarks redirected.
  async redirects() {
    return [
      { source: "/reports", destination: "/analytics", permanent: false },
      { source: "/history", destination: "/analytics/history", permanent: false },
      {
        source: "/allocation-history",
        destination: "/analytics/allocation",
        permanent: false,
      },
    ];
  },
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "Origin-Agent-Cluster", value: "?1" },
    ];

    if (isProduction) {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      });
    }

    return [{
      source: "/(.*)",
      headers,
    }];
  },
};

export default withBundleAnalyzer(nextConfig);
