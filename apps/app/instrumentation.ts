import { initializeSentry } from "@repo/observability/instrumentation";

export const register = initializeSentry;

/**
 * onRequestError — fires on every Server Component / Route Handler error BEFORE
 * Next.js strips the message in production. Logs full error + digest to the DB.
 *
 * IMPORTANT: database (Prisma) uses node:path/node:process/node:url which are
 * unavailable in the Edge runtime. Guard everything behind NEXT_RUNTIME check
 * so Turbopack never pulls these into the Edge bundle.
 */
export async function onRequestError(
  error: { digest?: string } & Error,
  _request: { path: string; method: string },
  _context: { routerKind: string; routeType: string; routePath?: string }
) {
  // Skip Next.js internal redirect/notFound signals — not real errors
  if (
    error.message?.includes("NEXT_REDIRECT") ||
    error.message?.includes("NEXT_NOT_FOUND")
  ) {
    return;
  }

  // Only run DB logging in Node.js runtime — never in Edge (Prisma uses node: modules)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { database } = await import("@repo/database");
      await Promise.race([
        database.auditLog.create({
          data: {
            organizationId: null,
            actorType: "system",
            action: "server.error",
            objectType: "request",
            objectId: (_context.routePath ?? _request.path ?? "unknown").slice(0, 255),
            newValue: {
              digest: error.digest ?? null,
              message: error.message ?? "Unknown",
              routePath: _context.routePath ?? null,
              routeType: _context.routeType ?? null,
              method: _request.method ?? null,
              stack: error.stack?.slice(0, 2000) ?? null,
            },
          },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
      ]).catch(() => {});
    } catch {
      // Best-effort — never crash the error handler
    }
  }

  // Sentry works in both runtimes
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error, {
      extra: {
        digest: error.digest,
        routePath: _context.routePath,
        routeType: _context.routeType,
      },
    });
  } catch {
    // Sentry not configured — fine
  }
}
