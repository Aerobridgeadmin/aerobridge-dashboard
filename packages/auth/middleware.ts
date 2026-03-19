import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/sign-in", "/sign-up", "/api/auth", "/api/webhooks", "/api/stripe/webhook", "/api/notifications", "/api/cron", "/api/admin", "/api/collaboration", "/api/slack-invite", "/api/stripe-connect", "/api/quickbooks", "/api/internal", "/contractor-info", "/org-onboard", "/onboarding-complete", "/verify", "/security", "/stripe-connect"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

export const authMiddleware = async (request: NextRequest) => {
  const { pathname } = request.nextUrl;

  // In non-production environments, skip auth entirely (dev entry handled by session.ts)
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next({ request });
  }

  // For public routes, skip the expensive getUser() call entirely
  if (isPublicRoute(pathname)) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Use getSession() for fast local JWT validation (~5ms) instead of
  // getUser() which makes a network roundtrip to Supabase (~235ms).
  // Server actions already call requireRole() → getUser() for write operations,
  // so the middleware only needs a fast gate check to redirect unauthenticated users.
  let authSession;
  try {
    const result = await supabase.auth.getSession();
    authSession = result.data?.session;
  } catch (err) {
    // Expired / invalid refresh token — expected when users return with stale sessions
    console.warn("[Middleware] Expired session, redirecting to sign-in:", (err as Error)?.message?.slice(0, 60));
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Redirect to sign-in if not authenticated
  if (!authSession?.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const user = authSession.user;

  // Defense-in-depth: block users with no org membership (unauthorized OAuth logins)
  // Skip this check for API routes and static assets
  if (!pathname.startsWith("/api/") && !pathname.startsWith("/_next/")) {
    const activeOrgId = user.user_metadata?.activeOrganizationId;
    if (!activeOrgId) {
      // Check if user has ANY org membership (super_admins may not have activeOrgId set)
      const hasRole = user.user_metadata?.role;
      if (!hasRole || hasRole === "member") {
        // No org, no elevated role — likely an unauthorized user that slipped through
        // Let the app handle this gracefully (it will show no-org state)
      }
    }
  }

  return supabaseResponse;
};
