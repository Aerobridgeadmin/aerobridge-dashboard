import { env } from "@/env";
import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics/provider";
import { DesignSystemProvider } from "@repo/design-system";
import { fonts } from "@repo/design-system/lib/fonts";
import { Toolbar } from "@repo/feature-flags/components/toolbar";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";

type RootLayoutProperties = {
  readonly children?: ReactNode;
};

export const metadata: Metadata = {
  title: "Remote Leverage — HR Platform",
  description:
    "Manage your global workforce with Remote Leverage. Onboarding, payments, compliance, and more.",
};

export default async function RootLayout({ children }: RootLayoutProperties) {
  const faviconHref = "/logo.png?v=20260225d";

  return (
    <html className={fonts} lang="en" suppressHydrationWarning>
      <head>
        {/* Favicon — manual link to avoid Next.js preload warning */}
        <link rel="icon" href={faviconHref} type="image/png" />
        <link rel="apple-touch-icon" href={faviconHref} />
        {/* Preconnect to external services to reduce DNS/TLS latency */}
        <link rel="dns-prefetch" href="https://blomhvnsgumdatojipws.supabase.co" />
        <link rel="preconnect" href="https://blomhvnsgumdatojipws.supabase.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://us.i.posthog.com" />
      </head>
      <body>
        {/* Auto-recover from stale chunk errors after deployments */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  var reloaded = sessionStorage.getItem('__chunk_reload');
  if (reloaded) sessionStorage.removeItem('__chunk_reload');

  function isStaleDeployError(msg) {
    return msg.indexOf('Failed to load chunk') !== -1 ||
      msg.indexOf('Loading chunk') !== -1 ||
      msg.indexOf('ChunkLoadError') !== -1 ||
      msg.indexOf('MIME type') !== -1 ||
      msg.indexOf('was not found on the server') !== -1 ||
      msg.indexOf('Failed to find Server Action') !== -1;
  }

  window.addEventListener('error', function(e) {
    var msg = (e.message || '') + ' ' + ((e.filename || ''));
    if (
      (isStaleDeployError(msg) ||
       (e.filename && e.filename.indexOf('/_next/static/chunks/') !== -1 && e.message && e.message.indexOf('404') !== -1))
      && !sessionStorage.getItem('__chunk_reload')
    ) {
      sessionStorage.setItem('__chunk_reload', '1');
      window.location.reload();
    }
  });

  window.addEventListener('unhandledrejection', function(e) {
    var msg = e.reason ? (e.reason.message || String(e.reason)) : '';
    if (
      (isStaleDeployError(msg) ||
       msg.indexOf('Failed to fetch dynamically imported module') !== -1)
      && !sessionStorage.getItem('__chunk_reload')
    ) {
      sessionStorage.setItem('__chunk_reload', '1');
      window.location.reload();
    }
  });
})();
          `,
          }}
        />
        <AnalyticsProvider>
          <DesignSystemProvider
            helpUrl={env.NEXT_PUBLIC_DOCS_URL}
            privacyUrl={new URL(
              "/legal/privacy",
              env.NEXT_PUBLIC_WEB_URL
            ).toString()}
            termsUrl={new URL("/legal/terms", env.NEXT_PUBLIC_WEB_URL).toString()}
          >
            {children}
          </DesignSystemProvider>
        </AnalyticsProvider>
        <Toolbar />
        {process.env.NEXT_PUBLIC_ENABLE_VERCEL_SPEED_INSIGHTS === "true" ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
