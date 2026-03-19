/**
 * safeAction — wraps a server action call so thrown errors are caught and
 * returned as { error: string } instead of bubbling up to Next.js, which
 * would replace them with a useless digest number in production.
 *
 * Usage in client components:
 *   const result = await safeAction(() => someServerAction(args));
 *   if (result.error) { showError(result.error); return; }
 *
 * The generic T is the success return type of the action.
 */
export async function safeAction<T>(
  fn: () => Promise<T>
): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("[safeAction]", message);
    return { error: message };
  }
}

/**
 * Type guard — check if a safeAction result is an error.
 */
export function isActionError(
  result: unknown
): result is { error: string } {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as { error: unknown }).error === "string"
  );
}
