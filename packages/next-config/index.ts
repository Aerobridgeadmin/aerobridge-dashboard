import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

export const config: NextConfig = {
  // Reduce X-Powered-By header leak
  poweredByHeader: false,

  experimental: {
    // Tree-shake large icon/component libraries — biggest single bundle win
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@knocklabs/react",
      "@radix-ui/react-icons",
      "date-fns",
      "@repo/design-system",
    ],
    serverActions: {
      bodySizeLimit: "12mb",
    },
    // Reduce client-side re-fetches on back/forward navigation
    staleTimes: {
      dynamic: 30,  // 30 seconds for dynamic pages
      static: 180,  // 3 minutes for static pages
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "hriq.remoteleverage.com",
      },
    ],
  },

  // biome-ignore lint/suspicious/useAwait: rewrites is async
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "https://us.i.posthog.com/decide",
      },
    ];
  },

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,

  // Security headers + cache headers for performance
  async headers() {
    const vercelVerify = process.env.VERCEL_LOG_DRAIN_VERIFY || "";
    return [
      // Vercel log drain verification header
      ...(vercelVerify
        ? [
            {
              source: "/api/internal/log-drain",
              headers: [
                { key: "x-vercel-verify", value: vercelVerify },
              ],
            },
          ]
        : []),
      // Veriff InContext SDK: allow iframe + camera on verification pages
      {
        source: "/verify/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(self \"https://*.veriff.me\" \"https://*.veriff.com\"), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/kyc-gate",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(self \"https://*.veriff.me\" \"https://*.veriff.com\"), microphone=(), geolocation=()" },
        ],
      },
      // Global security headers — CSP moved to middleware for nonce-based policy
      {
        source: "/:path((?!verify/|kyc-gate).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      // Aggressive caching for static assets (fonts, images, icons)
      {
        source: "/logo.png",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export const withAnalyzer = (sourceConfig: NextConfig): NextConfig =>
  withBundleAnalyzer()(sourceConfig);
