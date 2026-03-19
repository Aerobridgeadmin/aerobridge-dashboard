import { authMiddleware } from "@repo/auth/proxy";
import { NextResponse, type NextRequest } from "next/server";

// Build CSP header — permissive enough for Next.js hydration + third-party SDKs
function buildCSP(pathname: string): string {
  // Veriff pages need extra domains for their SDK iframe/camera
  if (pathname.startsWith("/verify") || pathname.startsWith("/kyc-gate")) {
    return [
      "default-src 'self' *.veriff.me *.veriff.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' *.veriff.me *.veriff.com *.probity.io *.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline' *.veriff.com *.veriff.me",
      "img-src 'self' blob: data: *.probity.io *.supabase.co",
      "frame-src 'self' *.veriff.me *.veriff.com *.hotjar.com",
      "connect-src 'self' *.veriff.com *.veriff.me *.probity.io *.supabase.co *.vercel-insights.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");
  }

  // Global CSP — allows Next.js hydration inline scripts
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' *.vercel-scripts.com cdn.veriff.me js.stripe.com connect-js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: *.supabase.co *.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' *.supabase.co *.vercel-insights.com *.vercel-scripts.com *.posthog.com *.stripe.com *.veriff.com *.knock.app wss://*.knock.app",
    "frame-src 'self' *.stripe.com *.hotjar.com *.veriff.me *.veriff.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files, webhooks, public routes, and API routes that don't need auth
  if (
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/stripe/webhook") ||
    pathname.startsWith("/api/stripe-connect") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/offboarding-audit") ||
    pathname.startsWith("/org-onboard") ||
    pathname.startsWith("/contractor-info") ||
    pathname.startsWith("/cadana-setup") ||
    pathname.startsWith("/wise-setup") ||
    pathname.startsWith("/onboarding-complete") ||
    pathname.startsWith("/stripe-connect") ||
    pathname.startsWith("/verify") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  const csp = buildCSP(pathname);

  // Run auth middleware (handles session refresh + redirects)
  const authResponse = await authMiddleware(request);

  // If auth returned a redirect, just add CSP to the redirect response
  if (authResponse.status >= 300 && authResponse.status < 400) {
    authResponse.headers.set("Content-Security-Policy", csp);
    return authResponse;
  }

  const response = NextResponse.next({ request });

  // Copy auth cookies (session refresh tokens) from auth response
  for (const cookie of authResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  // Set CSP on the response
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
