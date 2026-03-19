/**
 * Capture an exception to Sentry from server actions.
 * Non-blocking: never throws, never affects the caller.
 * Use this in catch blocks for critical flows (payments, payroll, offboarding, etc.)
 */
export async function captureServerException(
  error: unknown,
  context?: {
    action?: string;
    employeeId?: string;
    paymentId?: string;
    extra?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    const err = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException(err, {
      tags: {
        ...(context?.action ? { action: context.action } : {}),
      },
      extra: {
        ...(context?.employeeId ? { employeeId: context.employeeId } : {}),
        ...(context?.paymentId ? { paymentId: context.paymentId } : {}),
        ...context?.extra,
      },
    });
  } catch {
    // Sentry not configured — fine
  }
}
